#!/usr/bin/env python3
"""Write a BF3 HavokPhysicsData resource from geometry -- no Havok SDK, no shipped shapes.

Everything here was derived by measuring three shipped resources (see packfile.py for the
container). The parts that matter:

  * A resource holds the SAME object graph twice, once with 32-bit pointers and once with 64-bit
    ones, so the game can load it on either target.
  * The local and global fixup tables are NOT inside the sections. Frostbite hoists them into a
    trailer after the last packfile:

        [u32 size0][u32 size1][fixups0][fixups1][8, 20, 32, 44]

    which is why __data__ looks like solid object data right up to its virtual fixup table. The two
    otherwise-unexplained ints in each __data__ section header are that block's size and the offset
    of the global table inside it.
  * A pointer to an object that has a virtual fixup (i.e. a class instance) is a GLOBAL fixup;
    a pointer to anything else in the same section -- a string, an array's inline payload -- is a
    LOCAL one. That is the whole rule.

Shapes hang off HavokPhysicsContainer's own shape array, each behind an hkpConvexTranslateShape:
either an hkpBoxShape, or an hkpConvexVerticesShape with its hkpConvexVerticesConnectivity. The
container array IS the list, so no hkpListShape is needed, and no MOPP -- hkpMoppUtility::buildCode
lives in the Havok SDK and is not reproducible here, but convex shapes do not need it.

Both shape paths are checked against BF3's own bytes rather than assumed: see the regressions in
the repo notes -- a two-box graph reproduces hk_box.bin's object data exactly, and a convex graph
reproduces levels/xp5_001/objects/fencesloped_xp5's shape exactly but for m_userData and the
starting vertex of each face's winding.
"""
import os
import struct
import sys

import convex_layout

PTR32, PTR64 = 4, 8

# (name, signature) -- the signatures are Havok's own class checksums, read out of the shipped
# __classnames__ section. hkClass..hkClassEnumItem always lead the table.
CLASSES = [
    ("hkClass", 0x75585EF6),
    ("hkClassMember", 0x5C7EA4C2),
    ("hkClassEnum", 0x8A3609CF),
    ("hkClassEnumItem", 0xCE6F8A6C),
    ("hkRootLevelContainer", 0x2772C11E),
    ("HavokPhysicsContainer", 0x71817D59),
    ("hkpConvexTranslateShape", 0x5BA0A5F7),
    ("hkpBoxShape", 0x3444D2D5),
    ("hkpConvexVerticesShape", 0x44FF20D2),
    ("hkpConvexVerticesConnectivity", 0x63D38E9C),
]

HDR_MAGIC = struct.pack("<II", 0x57E0E057, 0x10C0C010)
VERSION = b"hk_2010.2.0-r1\0"


def align(n, a=16):
    return (n + a - 1) // a * a


def classnames():
    """The __classnames__ section: u32 signature, 0x09, name, NUL."""
    out = bytearray()
    off = {}

    for name, sig in CLASSES:
        out += struct.pack("<I", sig) + b"\x09"
        off[name] = len(out)
        out += name.encode() + b"\0"

    while len(out) % 16:
        out += b"\xff"

    return bytes(out), off


class Data:
    """The __data__ section under construction, with its fixups."""

    def __init__(self, ptr):
        self.ptr = ptr
        self.buf = bytearray()
        self.local = []          # (from, to)      same section, not an object
        self.glob = []           # (from, to)      same section, an object
        self.virt = []           # (offset, class name)

    def put_ptr(self, at, to, is_object):
        (self.glob if is_object else self.local).append((at, to))

    def u32(self, at, v):
        struct.pack_into("<I", self.buf, at, v)

    def f32(self, at, *v):
        struct.pack_into("<%df" % len(v), self.buf, at, *v)

    def array(self, at, data_at, count):
        """hkArray: pointer, size, capacity|DONT_DEALLOCATE -- ptr + 8 bytes wide."""
        self.u32(at + self.ptr, count)
        self.u32(at + self.ptr + 4, 0x80000000 | count)

        if count:
            self.put_ptr(at, data_at, False)


def child_size(ptr, shape):
    if shape["kind"] == "box":
        return 48 if ptr == PTR32 else 64

    return convex_layout.LAYOUT[ptr]["size"]


def payload_size(ptr, shape):
    """Bytes an hkpConvexVerticesShape needs after itself for its two array payloads."""
    if shape["kind"] == "box":
        return 0

    blocks = len(convex_layout.transposed(shape["verts"]))
    return align(blocks * convex_layout.FOUR_POINTS + len(shape["planes"]) * 16)


def conn_size(ptr, shape):
    """hkpConvexVerticesConnectivity plus its two inline payloads."""
    if shape["kind"] == "box":
        return 0

    idx = sum(len(f) for f in shape["faces"])
    return align(convex_layout.CONN[ptr]["size"] + align(idx * 2, 4) + len(shape["faces"]))


def build_data(ptr, shapes, names):
    """Lay out root -> container -> (translate -> shape)* for one pointer width."""
    d = Data(ptr)
    n = len(shapes)

    root_size = 80 if ptr == PTR32 else 96
    cont_body = 32 if ptr == PTR32 else 48
    cont_size = align(cont_body + ptr * n)
    tr_size = 48 if ptr == PTR32 else 80

    root = 0
    cont = root_size
    placed = []
    o = cont + cont_size

    for sh in shapes:
        child = o + tr_size
        pay = child + child_size(ptr, sh)
        conn = pay + payload_size(ptr, sh)
        placed.append((o, child, pay, conn))
        o = conn + conn_size(ptr, sh)

    d.buf = bytearray(o)

    # --- hkRootLevelContainer: one NamedVariant naming the physics container.
    nv = 16
    s1 = nv + (12 if ptr == PTR32 else 24)          # "PhysicsContainer"
    s2 = align(s1 + 17, 16)                          # "HavokPhysicsContainer"
    d.array(root, nv, 1)
    d.put_ptr(nv, s1, False)
    d.put_ptr(nv + ptr, s2, False)
    d.put_ptr(nv + 2 * ptr, cont, True)
    d.buf[s1:s1 + 17] = b"PhysicsContainer\0"
    d.buf[s2:s2 + 22] = b"HavokPhysicsContainer\0"
    d.virt.append((root, "hkRootLevelContainer"))

    # --- HavokPhysicsContainer: its shape array is stored inline right after the header, and that
    # array is what makes a multi-shape collision possible without an hkpListShape.
    arr = cont + cont_body
    d.array(cont + 2 * ptr, arr, n)
    d.array(cont + 3 * ptr + 8, 0, 0)                # the trailing empty array

    for i, (tr, _child, _pay, _conn) in enumerate(placed):
        d.put_ptr(arr + i * ptr, tr, True)

    d.virt.append((cont, "HavokPhysicsContainer"))

    r_off = 16 if ptr == PTR32 else 32
    child_off = 24 if ptr == PTR32 else 48
    tr_vec = 32 if ptr == PTR32 else 64
    box_vec = 32 if ptr == PTR32 else 48

    for sh, (tr, child, pay, conn) in zip(shapes, placed):
        cx, cy, cz = sh["centre"]
        d.f32(tr + r_off, sh["radius"])
        d.put_ptr(tr + child_off, child, True)
        d.f32(tr + tr_vec, cx, cy, cz, 0.0)
        d.virt.append((tr, "hkpConvexTranslateShape"))

        if sh["kind"] == "box":
            hx, hy, hz = sh["half"]
            d.f32(child + r_off, sh["radius"])
            d.f32(child + box_vec, hx, hy, hz, hx)
            d.virt.append((child, "hkpBoxShape"))
            continue

        lay = convex_layout.LAYOUT[ptr]
        blocks = convex_layout.transposed(sh["verts"])
        planes = convex_layout.plane_equations(sh["planes"], sh["radius"])
        half, centre = convex_layout.bounds(sh["verts"])

        d.f32(child + r_off, sh["radius"])
        d.f32(child + lay["half"], half[0], half[1], half[2], 0.0)
        d.f32(child + lay["centre"], centre[0], centre[1], centre[2], 0.0)
        d.array(child + lay["rot"], pay, len(blocks))
        d.u32(child + lay["num"], len(sh["verts"]))
        planes_at = pay + len(blocks) * convex_layout.FOUR_POINTS
        d.array(child + lay["planes"], planes_at, len(planes))
        d.put_ptr(child + lay["conn"], conn, True)
        d.virt.append((child, "hkpConvexVerticesShape"))

        for k, block in enumerate(blocks):
            d.f32(pay + k * convex_layout.FOUR_POINTS, *block)

        for k, pe in enumerate(planes):
            d.f32(planes_at + k * 16, *pe)

        # --- hkpConvexVerticesConnectivity: which vertices bound each face.
        cl = convex_layout.CONN[ptr]
        idx_at = conn + cl["size"]
        flat = [i for face in sh["faces"] for i in face]
        faces_at = idx_at + align(len(flat) * 2, 4)
        d.array(conn + cl["idx"], idx_at, len(flat))
        d.array(conn + cl["faces"], faces_at, len(sh["faces"]))

        for k, i in enumerate(flat):
            struct.pack_into("<H", d.buf, idx_at + k * 2, i)

        for k, face in enumerate(sh["faces"]):
            d.buf[faces_at + k] = len(face)

        d.virt.append((conn, "hkpConvexVerticesConnectivity"))

    # --- virtual fixups, then pad the section.
    virt_off = len(d.buf)

    for off, cls in d.virt:
        d.buf += struct.pack("<3I", off, 0, names[cls])

    while len(d.buf) % 16:
        d.buf += b"\0"

    return bytes(d.buf), virt_off, sorted(d.local), sorted(d.glob)


def fixup_block(local, glob):
    """The trailer half for one packfile: local pairs, terminator, global triples."""
    out = bytearray()

    for f, t in local:
        out += struct.pack("<2i", f, t)

    out += b"\xff" * 8
    global_off = align(len(out))
    out += b"\xff" * (global_off - len(out))

    for f, t in glob:
        out += struct.pack("<3i", f, 2, t)

    out += b"\xff" * (align(len(out)) - len(out))
    return bytes(out), global_off


def packfile(ptr, cn, data, virt_off, block_size, global_off, root_name_off):
    head = bytearray(64)
    head[0:8] = HDR_MAGIC
    struct.pack_into("<i", head, 12, 8)                       # file version
    head[16:20] = bytes([ptr, 1, 0, 1])                       # pointer size, LE, padding, EBCO
    struct.pack_into("<3i", head, 20, 3, 2, 0)                # sections, contents index/offset
    struct.pack_into("<2i", head, 32, 0, root_name_off)
    head[40:40 + len(VERSION)] = VERSION
    head[55] = 0xFF
    struct.pack_into("<i", head, 60, -1)

    table = 64 + 3 * 48
    types_at = table + len(cn)

    def entry(tag, absolute, fields):
        e = bytearray(48)
        e[0:len(tag)] = tag
        e[19] = 0xFF
        struct.pack_into("<7i", e, 20, absolute, *fields)
        return bytes(e)

    out = bytes(head)
    out += entry(b"__classnames__", table, (0, 0, len(cn), len(cn), len(cn), len(cn)))
    out += entry(b"__types__", types_at, (0, 0, 0, 0, 0, 0))
    out += entry(b"__data__", types_at,
                 (block_size, global_off, virt_off, len(data), len(data), len(data)))
    return out + cn + data


def box(centre, half, radius=0.0):
    return dict(kind="box", centre=centre, half=half, radius=radius)


def convex(centre, verts, planes, radius=0.0):
    """verts/planes must already be relative to `centre`."""
    f, kept = convex_layout.faces(verts, planes)

    if len(f) < 4:
        return None                          # not a solid: caller should drop it

    return dict(kind="convex", centre=centre, verts=verts, radius=radius, faces=f,
                planes=[planes[i] for i in kept])


def meta(blob):
    """The resource's 16-byte meta: the length of each of its four sections.

    (wrapper, 32-bit packfile, 64-bit packfile, fixup trailer), little-endian, summing to the file.
    MEASURED against every shipped HavokPhysicsData -- all 7617 carry one, and
    objects/loadingpallet_01's reads (128, 1424, 1664, 344) against a 3560 byte file whose sections
    are exactly those lengths.

    Without it the engine cannot find the packfiles inside the resource. It does not report that:
    it reads whatever is at offset zero and the level load dies with no message.
    """
    starts = []
    at = blob.find(HDR_MAGIC)

    while at >= 0:
        starts.append(at)
        at = blob.find(HDR_MAGIC, at + 4)

    if len(starts) < 2:
        return b"\0" * 16

    ends = []

    for base in starts:
        count = struct.unpack_from("<i", blob, base + 20)[0]
        ends.append(max(base + struct.unpack_from("<7i", blob, base + 64 + i * 48 + 20)[0]
                        + struct.unpack_from("<7i", blob, base + 64 + i * 48 + 20)[6]
                        for i in range(count)))

    return struct.pack("<4I", starts[0], starts[1] - starts[0], ends[-1] - starts[1],
                       len(blob) - ends[-1])


MIN_SHAPES = int(os.environ.get("HAVOK_MIN_SHAPES", "2"))


def build(shapes, mass=1.0):
    """shapes: box(...) / convex(...) descriptors, in metres.

    A container holding ONE convex shape is padded to two by repeating it.

    MEASURED, one shape type at a time: a lone hkpConvexVerticesShape wedges the server on load --
    every partition logs, then the process stops producing output entirely. A lone hkpBoxShape
    loads. Two convex shapes load. So this is not a minimum count, it is the one arrangement to
    avoid: a container whose only entry is a bare convex shape, which is also an arrangement BF3
    never ships. Every shipped resource decoded here holds either a MoppBvTree (house: a single
    entry) or a bare convex ALONGSIDE one (pallet, hk_box) -- never a lone bare convex.

    Repeating the shape is harmless: the duplicate occupies the same space as its original and
    collides identically. HAVOK_MIN_SHAPES overrides it.
    """
    shapes = [box(s[:3], s[3:6], s[6]) if isinstance(s, tuple) else s for s in shapes]

    while 0 < len(shapes) < MIN_SHAPES:
        shapes.append(shapes[-1])
    cn, names = classnames()
    parts, blocks = [], []

    for ptr in (PTR32, PTR64):
        data, virt_off, local, glob = build_data(ptr, shapes, names)
        block, global_off = fixup_block(local, glob)
        blocks.append(block)
        parts.append((ptr, data, virt_off, len(block), global_off))

    packs = [packfile(p, cn, d, v, bs, go, names["hkRootLevelContainer"])
             for p, d, v, bs, go in parts]

    def extent(sh, axis, sign):
        if sh["kind"] == "box":
            return sh["centre"][axis] + sign * sh["half"][axis]

        f = max if sign > 0 else min
        return sh["centre"][axis] + f(v[axis] for v in sh["verts"])

    lo = [min(extent(s, i, -1) for s in shapes) for i in range(3)]
    hi = [max(extent(s, i, 1) for s in shapes) for i in range(3)]

    wrapper = bytearray(128)
    # int[10] is NOT the shape count, whatever it looks like: shipped hk_box carries 2 with three
    # shapes in its container, and hk_pallet carries 3 with two. HAVOK_WRAPPER_COUNT overrides it
    # so the field can be tested on its own.
    count = int(os.environ.get('HAVOK_WRAPPER_COUNT', len(shapes)))
    struct.pack_into("<13I", wrapper, 0, 1, 0, 64, 0, 1, 64, 0, 1, 96, 0, count, 112, 0)
    struct.pack_into("<f", wrapper, 52, mass)
    struct.pack_into("<I", wrapper, 56, 1)
    struct.pack_into("<4f", wrapper, 64, lo[0], lo[1], lo[2], 0.0)
    struct.pack_into("<4f", wrapper, 80, hi[0], hi[1], hi[2], 0.0)

    trailer = struct.pack("<2I", len(blocks[0]), len(blocks[1]))
    trailer += blocks[0] + blocks[1] + struct.pack("<4I", 8, 20, 32, 44)
    return bytes(wrapper) + b"".join(packs) + trailer


if __name__ == "__main__":
    demo = [(0.0, -0.27561, 0.0, 0.1742, 0.1742, 0.1742, 0.0091683),
            (0.0, 2.4178, 0.0, 0.22, 2.47, 9.97, 0.03)]
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dust2/gen_box.bin"
    open(out, "wb").write(build(demo))
    print("wrote %s (%d bytes)" % (out, len(build(demo))))
