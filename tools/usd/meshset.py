#!/usr/bin/env python3
"""Frostbite 2 (BF3) MeshSet resource codec — read AND write.

The write side is what makes this worth having. Rime reads MeshSets but every
Serialize() on the reloc types throws, so nothing could ever emit one. The
blocking unknown was the relocation table; it is a flat uint32[] of the byte
offsets of every non-null 64-bit pointer slot, appended after the data. Null
pointers are not listed.

Everything encoded here was derived from real resources dumped out of the game
with Rime's `dump_resource`, then validated by parsing and re-serializing 109 of
them and comparing bytes. See docs/usd-roundtrip.md.

Layout facts that are NOT in Rime's model and matter for writing:

  * MeshLayout is 160 bytes when Type == 0 (rigid) and 176 when Type != 0
    (skinned/composite). The three trailing union pointers
    (PartBoundingBoxes/BoneIndexArray, PartTransforms/BoneShortNameArray,
    SubsetPartIndices) exist only in the 176-byte form. Rime reads 176
    unconditionally and runs 16 bytes past the end of every rigid LOD.
  * Every top-level block is 16-byte aligned.
  * The string pool shares suffixes, but only against the immediately preceding
    string. "a/b/c" following "Mesh:a/b/c" points into it; a repeat of an
    earlier-but-not-last string is appended fresh.
  * Reloc entries are emitted depth-first over the LODs, with the
    MeshSetLayout's own pointers last.
"""

import struct
from dataclasses import dataclass, field
from typing import List, Optional

ALIGN = 16
MESHSETLAYOUT_SIZE = 112
SUBSET_SIZE = 148
GDD_SIZE = 76


def _align(n, a=ALIGN):
    return (n + a - 1) // a * a


class Reader:
    def __init__(self, data):
        self.d = data

    def u8(self, o):
        return self.d[o]

    def u32(self, o):
        return struct.unpack_from("<I", self.d, o)[0]

    def u64(self, o):
        return struct.unpack_from("<Q", self.d, o)[0]

    def f32(self, o):
        return struct.unpack_from("<f", self.d, o)[0]

    def cstr(self, o):
        if o == 0:
            return None
        e = self.d.index(b"\0", o)
        return self.d[o:e].decode("latin1")


@dataclass
class Element:
    usage: int = 0
    fmt: int = 0
    offset: int = 255
    stream_index: int = 0


@dataclass
class Stream:
    stride: int = 0
    classification: int = 0


@dataclass
class GeomDecl:
    elements: List[Element] = field(default_factory=list)
    streams: List[Stream] = field(default_factory=list)
    element_count: int = 0
    stream_count: int = 0
    pad: bytes = b"\0\0"

    @staticmethod
    def parse(r, o):
        g = GeomDecl()
        for i in range(16):
            b = r.d[o + i * 4: o + i * 4 + 4]
            g.elements.append(Element(b[0], b[1], b[2], b[3]))
        for i in range(4):
            b = r.d[o + 64 + i * 2: o + 64 + i * 2 + 2]
            g.streams.append(Stream(b[0], b[1]))
        g.element_count = r.u8(o + 72)
        g.stream_count = r.u8(o + 73)
        g.pad = r.d[o + 74: o + 76]
        return g

    def pack(self):
        out = bytearray()
        for e in self.elements:
            out += bytes((e.usage, e.fmt, e.offset, e.stream_index))
        for s in self.streams:
            out += bytes((s.stride, s.classification))
        out += bytes((self.element_count, self.stream_count))
        out += self.pad
        assert len(out) == GDD_SIZE
        return bytes(out)


@dataclass
class Subset:
    geometry_declarations: int = 0
    material_name: Optional[str] = None
    material_index: int = 0
    primitive_count: int = 0
    start_index: int = 0
    vertex_offset: int = 0
    vertex_count: int = 0
    vertex_stride: int = 0
    primitive_type: int = 0
    bones_per_vertex: int = 0
    bone_count: int = 0
    bone_indices: List[int] = field(default_factory=list)
    has_bone_indices: bool = False
    geom_decl: GeomDecl = None
    texcoord_ratios: List[float] = field(default_factory=list)

    @staticmethod
    def parse(r, o):
        s = Subset()
        s.geometry_declarations = r.u64(o)
        s.material_name = r.cstr(r.u64(o + 8))
        s.material_index = r.u32(o + 16)
        s.primitive_count = r.u32(o + 20)
        s.start_index = r.u32(o + 24)
        s.vertex_offset = r.u32(o + 28)
        s.vertex_count = r.u32(o + 32)
        s.vertex_stride = r.u8(o + 36)
        s.primitive_type = r.u8(o + 37)
        s.bones_per_vertex = r.u8(o + 38)
        s.bone_count = r.u8(o + 39)
        bp = r.u64(o + 40)
        s.has_bone_indices = bp != 0
        s.bone_indices = list(struct.unpack_from("<%dH" % s.bone_count, r.d, bp)) if bp else []
        s.geom_decl = GeomDecl.parse(r, o + 48)
        s.texcoord_ratios = [r.f32(o + 124 + 4 * i) for i in range(6)]
        return s


@dataclass
class MeshLayout:
    type: int = 0
    subsets: List[Subset] = field(default_factory=list)
    category_indices: List[List[int]] = field(default_factory=lambda: [[] for _ in range(4)])
    # A category array can be non-null with count 0; that must survive the trip.
    category_present: List[bool] = field(default_factory=lambda: [False] * 4)
    flags: int = 0
    index_buffer_format: int = 0
    index_data_size: int = 0
    vertex_data_size: int = 0
    edge_partition_buffer_size: int = 0
    data_chunk_id: bytes = b"\0" * 16
    aux_vertex_index_data_offset: int = 0
    embedded_edge_data_ptr: int = 0
    shader_debug_name: Optional[str] = None
    name: Optional[str] = None
    short_name: Optional[str] = None
    name_hash: int = 0
    data: int = 0
    part_count: int = 0
    # Non-rigid only, and a union keyed on Type. Type 1 (skinned) puts
    # BoneIndexArray / BoneShortNameArray here, 4 bytes per part each, with the
    # third pointer null. Type 2 (composite) puts PartBoundingBoxes (32 B per
    # part), PartTransforms (64 B per part) and SubsetPartIndices (24 B per
    # subset). Kept as opaque bytes — nothing here needs their contents.
    tail_blobs: List[bytes] = field(default_factory=lambda: [b"", b"", b""])
    tail_present: List[bool] = field(default_factory=lambda: [False] * 3)

    @property
    def size(self):
        return 160 if self.type == 0 else 176

    @staticmethod
    def parse(r, o):
        m = MeshLayout()
        m.type = r.u32(o)
        cnt, ptr = r.u32(o + 4), r.u64(o + 8)
        for i in range(cnt):
            m.subsets.append(Subset.parse(r, ptr + i * SUBSET_SIZE))
        for c in range(4):
            cc, cp = r.u32(o + 16 + 12 * c), r.u64(o + 16 + 12 * c + 4)
            m.category_present[c] = cp != 0
            m.category_indices[c] = list(r.d[cp:cp + cc]) if cp else []
        m.flags = r.u32(o + 64)
        m.index_buffer_format = r.u32(o + 68)
        m.index_data_size = r.u32(o + 72)
        m.vertex_data_size = r.u32(o + 76)
        m.edge_partition_buffer_size = r.u32(o + 80)
        m.data_chunk_id = r.d[o + 84:o + 100]
        m.aux_vertex_index_data_offset = r.u32(o + 100)
        m.embedded_edge_data_ptr = r.u64(o + 104)
        m.shader_debug_name = r.cstr(r.u64(o + 112))
        m.name = r.cstr(r.u64(o + 120))
        m.short_name = r.cstr(r.u64(o + 128))
        m.name_hash = r.u32(o + 136)
        m.data = r.u64(o + 140)
        m.part_count = r.u32(o + 148)
        if m.type != 0:
            sizes = ((32 * m.part_count, 64 * m.part_count, 24 * cnt)
                     if m.type == 2 else
                     (4 * m.part_count, 4 * m.part_count, 24 * cnt))
            for k in range(3):
                p = r.u64(o + 152 + 8 * k)
                m.tail_present[k] = p != 0
                if p:
                    m.tail_blobs[k] = r.d[p:p + sizes[k]]
        return m


@dataclass
class MeshSet:
    mesh_type: int = 0
    flags: int = 0
    total_subset_count: int = 0
    bbox_min: tuple = (0.0, 0.0, 0.0)
    bbox_min_pad: float = 0.0
    bbox_max: tuple = (0.0, 0.0, 0.0)
    bbox_max_pad: float = 0.0
    lods: List[MeshLayout] = field(default_factory=list)
    name: Optional[str] = None
    short_name: Optional[str] = None
    name_hash: int = 0
    padding: int = 0
    # 299 of BF3's 9794 MeshSets carry an inline geometry block between the
    # struct data and the relocation table (resource meta field f1). Opaque here.
    inline_tail: bytes = b""

    @staticmethod
    def parse(data):
        r = Reader(data)
        ms = MeshSet()
        ms.mesh_type = r.u32(0)
        ms.flags = r.u32(4)
        lod_count = r.u32(8)
        ms.total_subset_count = r.u32(12)
        ms.bbox_min = (r.f32(16), r.f32(20), r.f32(24))
        ms.bbox_min_pad = r.f32(28)
        ms.bbox_max = (r.f32(32), r.f32(36), r.f32(40))
        ms.bbox_max_pad = r.f32(44)
        for i in range(lod_count):
            p = r.u64(48 + 8 * i)
            if p:
                ms.lods.append(MeshLayout.parse(r, p))
        ms.name = r.cstr(r.u64(88))
        ms.short_name = r.cstr(r.u64(96))
        ms.name_hash = r.u32(104)
        ms.padding = r.u32(108)
        # Locating the relocation table by scanning backwards for plausible
        # offsets is unreliable — on the vegetation meshes, inline geometry
        # bytes pass that test and the scan runs into the data. The table's
        # length is a property of the model (one entry per non-null pointer),
        # so derive it: serialize once and read the count back out of the meta.
        # In a bundle it is simply meta field f2; this is for loose payloads.
        _, meta = ms.serialize()
        table_bytes = struct.unpack_from("<I", meta, 8)[0]
        table_start = len(data) - table_bytes
        end = _align(ms._modelled_end(data))
        ms.inline_tail = data[end:table_start] if end < table_start else b""
        return ms

    def _modelled_end(self, data):
        """Highest byte offset any modelled block reaches."""
        r = Reader(data)
        end = MESHSETLAYOUT_SIZE
        for i in range(len(self.lods)):
            p = r.u64(48 + 8 * i)
            lod = self.lods[i]
            end = max(end, p + lod.size)
            sp = r.u64(p + 8)
            end = max(end, sp + SUBSET_SIZE * len(lod.subsets))
            for si, sub in enumerate(lod.subsets):
                bp = r.u64(sp + si * SUBSET_SIZE + 40)
                if bp:
                    end = max(end, bp + 2 * sub.bone_count)
                mp = r.u64(sp + si * SUBSET_SIZE + 8)
                if mp:
                    end = max(end, mp + len(sub.material_name or "") + 1)
            for c in range(4):
                cp = r.u64(p + 16 + 12 * c + 4)
                if cp:
                    end = max(end, cp + len(lod.category_indices[c]))
            for off, txt in ((112, lod.shader_debug_name), (120, lod.name), (128, lod.short_name)):
                q = r.u64(p + off)
                if q:
                    end = max(end, q + len(txt) + 1)
            for k in range(3):
                if lod.tail_present[k]:
                    end = max(end, r.u64(p + 152 + 8 * k) + len(lod.tail_blobs[k]))
        for off, txt in ((88, self.name), (96, self.short_name)):
            q = r.u64(off)
            if q:
                end = max(end, q + len(txt) + 1)
        return end

    # ---------------------------------------------------------------- write

    def serialize(self):
        """Emit the resource payload, relocation table included."""
        buf = bytearray(MESHSETLAYOUT_SIZE)
        slots = []          # (offset_of_pointer_slot, target) in writer visit order
        pool = []           # (offset, text) most-recent-last

        def align(a=ALIGN):
            buf.extend(b"\0" * (_align(len(buf), a) - len(buf)))

        def put_str(text):
            """Append a fresh, NUL-terminated string. Material names always go
            in this way, including empty ones, which get their own NUL byte."""
            if text is None:
                return 0
            off = len(buf)
            buf.extend(text.encode("latin1") + b"\0")
            return off

        def put_suffix(parent_off, parent_text, text):
            """BF3 stores the related name fields once and points into the
            longer one: ShaderDebugName is "Mesh:" + Name, and ShortName is a
            tail of Name. Anything that is not a genuine suffix is appended."""
            if text is None:
                return 0
            if parent_text is not None and parent_off and parent_text.endswith(text):
                return parent_off + (len(parent_text) - len(text))
            return put_str(text)

        # MeshLayouts, contiguous. Both sizes are multiples of 16 so alignment holds.
        align()
        lod_offsets = []
        for lod in self.lods:
            lod_offsets.append(len(buf))
            buf.extend(b"\0" * lod.size)

        # Subset arrays, one block per LOD.
        subset_offsets = []
        for lod in self.lods:
            align()
            subset_offsets.append(len(buf))
            for s in lod.subsets:
                o = len(buf)
                buf.extend(b"\0" * SUBSET_SIZE)
                struct.pack_into("<Q", buf, o, s.geometry_declarations)
                struct.pack_into("<IIIII", buf, o + 16, s.material_index,
                                 s.primitive_count, s.start_index,
                                 s.vertex_offset, s.vertex_count)
                buf[o + 36:o + 40] = bytes((s.vertex_stride, s.primitive_type,
                                            s.bones_per_vertex, s.bone_count))

                buf[o + 48:o + 48 + GDD_SIZE] = s.geom_decl.pack()
                for i, v in enumerate(s.texcoord_ratios):
                    struct.pack_into("<f", buf, o + 124 + 4 * i, v)

        # Bone-index arrays (ushort[bone_count]), packed across every LOD.
        bone_off = {}
        if any(sub.has_bone_indices for lod in self.lods for sub in lod.subsets):
            align()
            for li, lod in enumerate(self.lods):
                for si, sub in enumerate(lod.subsets):
                    if sub.has_bone_indices:
                        bone_off[(li, si)] = len(buf)
                        for v in sub.bone_indices:
                            buf.extend(struct.pack("<H", v))

        # String pool.
        align()
        str_off = {}
        for li, lod in enumerate(self.lods):
            for si, sub in enumerate(lod.subsets):
                str_off[("mat", li, si)] = put_str(sub.material_name)
            d = str_off[("dbg", li)] = put_str(lod.shader_debug_name)
            nm = str_off[("name", li)] = put_suffix(d, lod.shader_debug_name, lod.name)
            str_off[("short", li)] = put_suffix(nm, lod.name, lod.short_name)
        n0 = str_off["name"] = put_str(self.name)
        str_off["short"] = put_suffix(n0, self.name, self.short_name)

        # Category subset-index arrays.
        align()
        cat_off = []
        for lod in self.lods:
            per = []
            for c in range(4):
                per.append(len(buf) if lod.category_present[c] else 0)
                buf.extend(bytes(lod.category_indices[c]))
            cat_off.append(per)

        # Skinned bone arrays / composite part blocks.
        # Each blob is aligned to its element: composite float arrays (AABB,
        # 4x4 matrix) to 16, skinned uint32 arrays to 4. That is why composite
        # LODs show 8-byte gaps between them and skinned LODs pack tight.
        part_off = []
        if any(any(l.tail_present) for l in self.lods):
            align()          # the region as a whole starts 16-aligned
        for lod in self.lods:
            per = []
            for k in range(3):
                if lod.tail_present[k]:
                    align(16 if lod.type == 2 else 4)
                    per.append(len(buf))
                    buf.extend(lod.tail_blobs[k])
                else:
                    per.append(0)
            part_off.append(tuple(per))

        # ---- fill in the structures now that every target offset is known ----
        for li, lod in enumerate(self.lods):
            o = lod_offsets[li]
            struct.pack_into("<I", buf, o, lod.type)
            struct.pack_into("<I", buf, o + 4, len(lod.subsets))
            struct.pack_into("<Q", buf, o + 8, subset_offsets[li])
            for c in range(4):
                struct.pack_into("<I", buf, o + 16 + 12 * c, len(lod.category_indices[c]))
                struct.pack_into("<Q", buf, o + 16 + 12 * c + 4, cat_off[li][c])
            struct.pack_into("<IIIII", buf, o + 64, lod.flags, lod.index_buffer_format,
                             lod.index_data_size, lod.vertex_data_size,
                             lod.edge_partition_buffer_size)
            buf[o + 84:o + 100] = lod.data_chunk_id
            struct.pack_into("<I", buf, o + 100, lod.aux_vertex_index_data_offset)
            struct.pack_into("<Q", buf, o + 104, lod.embedded_edge_data_ptr)
            struct.pack_into("<Q", buf, o + 112, str_off[("dbg", li)])
            struct.pack_into("<Q", buf, o + 120, str_off[("name", li)])
            struct.pack_into("<Q", buf, o + 128, str_off[("short", li)])
            struct.pack_into("<I", buf, o + 136, lod.name_hash)
            struct.pack_into("<Q", buf, o + 140, lod.data)
            struct.pack_into("<I", buf, o + 148, lod.part_count)
            if lod.type != 0:
                for i, p in enumerate(part_off[li]):
                    struct.pack_into("<Q", buf, o + 152 + 8 * i, p)
            for si in range(len(lod.subsets)):
                so = subset_offsets[li] + si * SUBSET_SIZE
                struct.pack_into("<Q", buf, so + 8, str_off[("mat", li, si)])
                struct.pack_into("<Q", buf, so + 40, bone_off.get((li, si), 0))

        struct.pack_into("<II", buf, 0, self.mesh_type, self.flags)
        struct.pack_into("<II", buf, 8, len(self.lods), self.total_subset_count)
        struct.pack_into("<ffff", buf, 16, *self.bbox_min, self.bbox_min_pad)
        struct.pack_into("<ffff", buf, 32, *self.bbox_max, self.bbox_max_pad)
        for i, lo in enumerate(lod_offsets):
            struct.pack_into("<Q", buf, 48 + 8 * i, lo)
        struct.pack_into("<Q", buf, 88, str_off["name"])
        struct.pack_into("<Q", buf, 96, str_off["short"])
        struct.pack_into("<II", buf, 104, self.name_hash, self.padding)

        # ---- relocation table: depth-first over LODs, MeshSetLayout last ----
        for li, lod in enumerate(self.lods):
            o = lod_offsets[li]
            slots.append(o + 8)                                  # Subsets.ptr
            for si in range(len(lod.subsets)):
                so = subset_offsets[li] + si * SUBSET_SIZE
                if str_off[("mat", li, si)]:
                    slots.append(so + 8)                         # MaterialName
                if (li, si) in bone_off:
                    slots.append(so + 40)
            for c in range(4):
                if cat_off[li][c]:
                    slots.append(o + 16 + 12 * c + 4)
            for off, key in ((104, None), (112, ("dbg", li)),
                             (120, ("name", li)), (128, ("short", li))):
                if key is None:
                    if lod.embedded_edge_data_ptr:
                        slots.append(o + off)
                elif str_off[key]:
                    slots.append(o + off)
            if lod.type != 0:
                for i in range(3):
                    if lod.tail_present[i]:
                        slots.append(o + 152 + 8 * i)
        for i, lo in enumerate(lod_offsets):
            if lo:
                slots.append(48 + 8 * i)
        if str_off["name"]:
            slots.append(88)
        if str_off["short"]:
            slots.append(96)

        align()
        struct_size = len(buf)
        buf.extend(self.inline_tail)
        table_start = len(buf)
        for sl in slots:
            buf.extend(struct.pack("<I", sl))
        meta = struct.pack("<IIII", struct_size, len(self.inline_tail),
                           len(buf) - table_start, 0x00940070)
        return bytes(buf), meta


def parse_file(path):
    with open(path, "rb") as f:
        return MeshSet.parse(f.read())


def reloc_table(data):
    """Recover the relocation table of an existing payload, for verification."""
    n = len(data)
    i = n
    out = []
    while i >= 4:
        v = struct.unpack_from("<I", data, i - 4)[0]
        if 0x10 <= v < n and struct.unpack_from("<Q", data, v)[0] < n:
            out.append(v)
            i -= 4
        else:
            break
    return list(reversed(out)), i
