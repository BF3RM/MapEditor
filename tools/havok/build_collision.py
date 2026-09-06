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
    ("hkpConvexTransformShape", 0xAE3E5017),
    ("hkpListShape", 0xA1937CBD),
    ("hkpBoxShape", 0x3444D2D5),
    ("hkpCylinderShape", 0x3E463C3A),
    ("hkpSphereShape", 0x0795D9FA),
    ("hkpCapsuleShape", 0xDD0B1FD3),
    ("hkpConvexVerticesShape", 0x44FF20D2),
    ("hkpConvexVerticesConnectivity", 0x63D38E9C),
]

# Every signature above was READ OUT of the game's own __classnames__ sections and is unanimous
# across all 7,617 resources -- the five new ones were guessed first and every guess was wrong.

# Field offsets per pointer width. Everything here was MEASURED off the game's own packfiles rather
# than derived: object SIZES from the span between consecutive virtual fixups across all 7,617
# resources (hkpConvexTransformShape 96/128, hkpCylinderShape 96/112, hkpSphereShape 32/64,
# hkpCapsuleShape 64/80), and the pointer slots from where the fixup table puts them.
PLACE = {
    PTR32: dict(radius=16, child=24, translate=32, rot=32, transform_trans=80,
                translate_size=48, transform_size=96),
    PTR64: dict(radius=32, child=48, translate=64, rot=64, transform_trans=112,
                translate_size=80, transform_size=128),
}

# hkpListShape. The childInfo array is INLINE after the header and its hkArray points at itself --
# the game's 64-bit list carries one local fixup, +48 -> +144, and 39 child pointers at 144 + 32i.
LIST = {
    PTR32: dict(size=112, arr=24, half=48, centre=64, enabled=80, stride=16),
    PTR64: dict(size=144, arr=48, half=80, centre=96, enabled=112, stride=32),
}

LEAF_SIZE = {
    "box": {PTR32: 48, PTR64: 64},
    "cylinder": {PTR32: 96, PTR64: 112},
    "sphere": {PTR32: 32, PTR64: 64},
    "capsule": {PTR32: 64, PTR64: 80},
}

# hkpCylinderShape and hkpCapsuleShape put their axis ends in the same two slots; the cylinder adds
# its barrel radius and a height-field factor between the convex radius and them.
AXIAL = {
    PTR32: dict(radius=16, cyl_radius=20, factor=24, a=32, b=48, perp1=64, perp2=80),
    PTR64: dict(radius=32, cyl_radius=36, factor=40, a=48, b=64, perp1=80, perp2=96),
}

IDENTITY = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))

HDR_MAGIC = struct.pack("<II", 0x57E0E057, 0x10C0C010)
VERSION = b"hk_2010.2.0-r1\0"


def align(n, a=16):
    return (n + a - 1) // a * a


SIGNATURE = dict(CLASSES)

# hkClass..hkClassEnumItem always lead the table, in every resource in the game.
LEADING = ["hkClass", "hkClassMember", "hkClassEnum", "hkClassEnumItem"]


def classnames(used):
    """The __classnames__ section: u32 signature, 0x09, name, NUL.

    Only the classes actually emitted, in the order they first appear in the data section. That is
    the game's own rule, not a convention: checked on BigRadioTower, MEHouse01Large and
    big_curtain, whose tables list exactly the classes their objects use and in exactly the order
    the objects appear. Emitting a fixed table of ten put names in the file for classes the
    resource never instantiates.
    """
    out = bytearray()
    off = {}

    for name in LEADING + [c for c in used if c not in LEADING]:
        out += struct.pack("<I", SIGNATURE[name]) + b"\x09"
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
    if shape["kind"] in LEAF_SIZE:
        return LEAF_SIZE[shape["kind"]][ptr]

    return convex_layout.LAYOUT[ptr]["size"]


def payload_size(ptr, shape):
    """Bytes an hkpConvexVerticesShape needs after itself for its two array payloads."""
    if shape["kind"] != "convex":
        return 0

    blocks = len(convex_layout.transposed(shape["verts"]))
    return align(blocks * convex_layout.FOUR_POINTS + len(shape["planes"]) * 16)


def wants_connectivity(shape):
    """Whether to emit hkpConvexVerticesConnectivity for this hull.

    NOT always, which is what this used to do. MEASURED: BF3 attaches one to 5,330 of its 36,004
    hkpConvexVerticesShape objects -- 14.8% -- and leaves the pointer null on the rest.
    BigRadioTower has nine hulls and no connectivity at all, so emitting nine was nine objects the
    game does not have. A shape carries `connectivity` when it was read from a resource that had
    one; a hull modelled in a DCC gets one because its faces are the only record of its winding.
    """
    if shape["kind"] != "convex":
        return False

    return bool(shape.get("connectivity", True)) and bool(shape.get("faces"))


def conn_size(ptr, shape):
    """hkpConvexVerticesConnectivity plus its two inline payloads."""
    if not wants_connectivity(shape):
        return 0

    idx = sum(len(f) for f in shape["faces"])
    return align(convex_layout.CONN[ptr]["size"] + align(idx * 2, 4) + len(shape["faces"]))


def _rotation(shape):
    """The placement's rotation as three columns, or None when it is the identity."""
    r = shape.get("rotation")

    if not r:
        return None

    cols = tuple(tuple(float(v) for v in col) for col in r)

    return None if cols == IDENTITY else cols


def _is_placed(shape):
    """Whether this shape needs a wrapper object at all.

    A shape at the origin with no rotation is its own placement, and BF3 hangs it straight off the
    list: BigRadioTower's 11 cylinders and 9 hulls are direct children, and only its boxes -- which
    ARE offset -- go behind a wrapper. Wrapping everything wrote 20 hkpConvexTranslateShape objects
    the game does not have.
    """
    return _rotation(shape) is not None or tuple(float(c) for c in shape["centre"]) != (0.0, 0.0, 0.0)


def _leaf_key(shape):
    """What makes two placements share one leaf object.

    BF3 instances: BigRadioTower puts 26 distinct hkpBoxShape objects in the world 69 times, and a
    builder that emits one box per placement writes 69. The key is the GEOMETRY only -- the centre
    and rotation live in the wrapper, not in the shape.
    """
    # When a shape came out of a resource, the game already decided what shares what: two
    # placements point at the same object or they do not. Honouring that reproduces BF3's own
    # instancing exactly, where a geometry key would merge two boxes the game kept apart -- 58 of
    # them over a 250-resource sweep.
    if shape.get("leaf_id") is not None:
        return ("id", shape["leaf_id"])

    kind = shape["kind"]

    if kind == "box":
        return (kind, tuple(shape["half"]), shape["radius"])

    if kind == "sphere":
        return (kind, shape["radius"])

    if kind in ("cylinder", "capsule"):
        return (kind, tuple(shape.get("vertexA", (0, 0, 0))), tuple(shape.get("vertexB", (0, 0, 0))),
                shape.get("cylinderRadius", 0.0), shape["radius"])

    # A hull's identity is its vertices and planes; nothing else about it can differ.
    return (kind, tuple(map(tuple, shape["verts"])), tuple(map(tuple, shape["planes"])),
            shape["radius"], wants_connectivity(shape))


def _extent(sh, axis, sign):
    """The shape's furthest point along one axis, in the placement's frame.

    Rotation is deliberately ignored: this feeds an AABB that only has to CONTAIN the shape, and an
    axis-aligned bound of the unrotated extents always does.
    """
    if sh["kind"] == "box":
        return sh["centre"][axis] + sign * sh["half"][axis]

    if sh["kind"] == "sphere":
        return sh["centre"][axis] + sign * sh["radius"]

    if sh["kind"] in ("cylinder", "capsule"):
        r = float(sh.get("cylinderRadius", 0.0)) + sh["radius"]
        ends = (sh.get("vertexA", (0.0, 0.0, 0.0)), sh.get("vertexB", (0.0, 0.0, 0.0)))
        f = max if sign > 0 else min

        return sh["centre"][axis] + f(e[axis] for e in ends) + sign * r

    f = max if sign > 0 else min

    return sh["centre"][axis] + f(v[axis] for v in sh["verts"])


def plan(shapes):
    """-> (leaves, leaf_of, classes) for a shape list.

    `leaves` are the distinct geometry objects, `leaf_of[i]` is the leaf each placement uses, and
    `classes` is the class-name order the data section will produce.
    """
    leaves, index, leaf_of = [], {}, []

    for sh in shapes:
        key = _leaf_key(sh)

        if key not in index:
            index[key] = len(leaves)
            leaves.append(sh)

        leaf_of.append(index[key])

    return leaves, leaf_of


def used_classes(shapes, leaves, use_list):
    """Class names in the order the data section lays the objects out."""
    order = ["hkRootLevelContainer", "HavokPhysicsContainer"]

    if use_list:
        order.append("hkpListShape")

    def add(name):
        if name not in order:
            order.append(name)

    for sh in shapes:
        if _is_placed(sh):
            add("hkpConvexTransformShape" if _rotation(sh) else "hkpConvexTranslateShape")

    leaf_class = dict(box="hkpBoxShape", cylinder="hkpCylinderShape", sphere="hkpSphereShape",
                      capsule="hkpCapsuleShape", convex="hkpConvexVerticesShape")

    for sh in leaves:
        add(leaf_class[sh["kind"]])

        if wants_connectivity(sh):
            add("hkpConvexVerticesConnectivity")

    return order


def _perpendiculars(a, b):
    """Two orthonormal vectors across a cylinder's axis.

    The game stores them and they are not derivable from the axis alone -- any pair spanning the
    plane will do, and BF3's are orthonormal and perpendicular to the axis (measured on
    BigRadioTower: both dot products 0.000000, |p| 1.000000).
    """
    axis = [b[i] - a[i] for i in range(3)]
    length = sum(c * c for c in axis) ** 0.5

    if length < 1e-9:
        return (1.0, 0.0, 0.0), (0.0, 0.0, 1.0)

    axis = [c / length for c in axis]
    seed = (0.0, 0.0, 1.0) if abs(axis[1]) > 0.9 or abs(axis[0]) > 0.9 else (1.0, 0.0, 0.0)

    p1 = [axis[1] * seed[2] - axis[2] * seed[1],
          axis[2] * seed[0] - axis[0] * seed[2],
          axis[0] * seed[1] - axis[1] * seed[0]]
    n = sum(c * c for c in p1) ** 0.5
    p1 = [c / n for c in p1]

    p2 = [axis[1] * p1[2] - axis[2] * p1[1],
          axis[2] * p1[0] - axis[0] * p1[2],
          axis[0] * p1[1] - axis[1] * p1[0]]

    return tuple(p1), tuple(p2)


def build_data(ptr, shapes, names, use_list=False):
    """Lay out root -> container -> [list ->] placement* -> leaf* for one pointer width.

    Two things changed here and both were measured against the game. Placements and LEAVES are now
    separate: BF3 puts 26 distinct hkpBoxShape objects in BigRadioTower and points 69 wrappers at
    them, and emitting one box per placement wrote 69 boxes the game does not have. And a rotated
    placement is an hkpConvexTransformShape, not a translate -- 52,448 of BF3's placements are.
    """
    d = Data(ptr)
    pl = PLACE[ptr]
    leaves, leaf_of = plan(shapes)

    root_size = 80 if ptr == PTR32 else 96
    cont_body = 32 if ptr == PTR32 else 48
    n_roots = 1 if use_list else len(shapes)
    cont_size = align(cont_body + ptr * n_roots)

    root = 0
    cont = root_size
    o = cont + cont_size

    lst = None

    if use_list:
        lst = o
        o = align(lst + LIST[ptr]["size"] + LIST[ptr]["stride"] * len(shapes))

    place_at = []

    for sh in shapes:
        if not _is_placed(sh):
            place_at.append(None)                # the leaf is its own placement
            continue

        place_at.append(o)
        o += pl["transform_size"] if _rotation(sh) else pl["translate_size"]

    leaf_at = []

    for sh in leaves:
        child = o
        pay = child + child_size(ptr, sh)
        conn = pay + payload_size(ptr, sh)
        leaf_at.append((child, pay, conn))
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

    # --- HavokPhysicsContainer: its shape array is stored inline right after the header. It points
    # at the list when there is one, and straight at the placements when there is not -- BF3 ships
    # both (900 resources put a bare hkpListShape under the container, 1,272 a bare translate).
    arr = cont + cont_body
    roots = [lst] if use_list else [at if at is not None else leaf_at[li][0]
                                    for at, li in zip(place_at, leaf_of)]
    d.array(cont + 2 * ptr, arr, len(roots))
    d.array(cont + 3 * ptr + 8, 0, 0)                # the trailing empty array

    for i, target in enumerate(roots):
        d.put_ptr(arr + i * ptr, target, True)

    d.virt.append((cont, "HavokPhysicsContainer"))

    def bounds_of_all():
        lo = [min(_extent(sh, i, -1) for sh in shapes) for i in range(3)]
        hi = [max(_extent(sh, i, 1) for sh in shapes) for i in range(3)]
        half = [(hi[i] - lo[i]) / 2.0 for i in range(3)]
        centre = [(hi[i] + lo[i]) / 2.0 for i in range(3)]
        return half, centre

    if use_list:
        li = LIST[ptr]
        info = lst + li["size"]

        # hkcdShape's four bytes read 0xFFFFFFFF on every shipped list.
        struct.pack_into("<I", d.buf, lst + 2 * ptr, 0xFFFFFFFF)
        d.array(lst + li["arr"], info, len(shapes))

        half, centre = bounds_of_all()
        d.f32(lst + li["half"], half[0], half[1], half[2], 0.0)
        d.f32(lst + li["centre"], centre[0], centre[1], centre[2], 1.0)

        # m_enabledChildren, 256 bits, all on.
        for k in range(8):
            d.u32(lst + li["enabled"] + k * 4, 0xFFFFFFFF)

        # A childInfo is the shape pointer and three fields the game leaves ZERO -- checked on
        # BigRadioTower, whose 89 entries are all (ptr, 0, 0, 0).
        for i, (at, leaf) in enumerate(zip(place_at, leaf_of)):
            d.put_ptr(info + i * li["stride"], at if at is not None else leaf_at[leaf][0], True)

        d.virt.append((lst, "hkpListShape"))

    # --- placements.
    for sh, at, li in zip(shapes, place_at, leaf_of):
        if at is None:
            continue

        child = leaf_at[li][0]
        cx, cy, cz = sh["centre"]
        rot = _rotation(sh)

        d.f32(at + pl["radius"], sh["radius"])
        d.put_ptr(at + pl["child"], child, True)

        if rot is None:
            d.f32(at + pl["translate"], cx, cy, cz, 0.0)
            d.virt.append((at, "hkpConvexTranslateShape"))
            continue

        # An hkTransform: three rotation COLUMNS then the translation, 16 bytes apart because each
        # is an hkVector4 whose w is padding.
        for k, col in enumerate(rot):
            d.f32(at + pl["rot"] + k * 16, col[0], col[1], col[2], 0.0)

        d.f32(at + pl["transform_trans"], cx, cy, cz, 0.0)
        d.virt.append((at, "hkpConvexTransformShape"))

    # --- leaves.
    box_vec = 32 if ptr == PTR32 else 48
    ax = AXIAL[ptr]

    for sh, (child, pay, conn) in zip(leaves, leaf_at):
        kind = sh["kind"]
        d.f32(child + pl["radius"], sh["radius"])

        if kind == "box":
            hx, hy, hz = sh["half"]
            d.f32(child + box_vec, hx, hy, hz, hx)
            d.virt.append((child, "hkpBoxShape"))
            continue

        if kind == "sphere":
            d.virt.append((child, "hkpSphereShape"))
            continue

        if kind in ("cylinder", "capsule"):
            a = tuple(float(c) for c in sh.get("vertexA", (0.0, 0.0, 0.0)))
            b = tuple(float(c) for c in sh.get("vertexB", (0.0, 0.0, 0.0)))

            if kind == "cylinder":
                cyl_r = float(sh.get("cylinderRadius", 0.0))
                d.f32(child + ax["cyl_radius"], cyl_r)
                d.f32(child + ax["factor"], float(sh.get("baseRadiusFactor", 0.8)))
                p1, p2 = _perpendiculars(a, b)
                d.f32(child + ax["perp1"], p1[0], p1[1], p1[2], 0.0)
                d.f32(child + ax["perp2"], p2[0], p2[1], p2[2], 0.0)
            else:
                cyl_r = 0.0

            # MEASURED: the w lane of both axis ends is the barrel radius plus the convex radius --
            # BigRadioTower's masts carry 3.9651923 against 3.805470 + 0.159723.
            w = cyl_r + sh["radius"]
            d.f32(child + ax["a"], a[0], a[1], a[2], w)
            d.f32(child + ax["b"], b[0], b[1], b[2], w)
            d.virt.append((child, "hkpCylinderShape" if kind == "cylinder" else "hkpCapsuleShape"))
            continue

        lay = convex_layout.LAYOUT[ptr]
        blocks = convex_layout.transposed(sh["verts"])
        planes = convex_layout.plane_equations(sh["planes"], sh["radius"])
        half, centre = convex_layout.bounds(sh["verts"])

        d.f32(child + lay["half"], half[0], half[1], half[2], 0.0)
        d.f32(child + lay["centre"], centre[0], centre[1], centre[2], 0.0)
        d.array(child + lay["rot"], pay, len(blocks))
        d.u32(child + lay["num"], len(sh["verts"]))
        planes_at = pay + len(blocks) * convex_layout.FOUR_POINTS
        d.array(child + lay["planes"], planes_at, len(planes))

        if wants_connectivity(sh):
            d.put_ptr(child + lay["conn"], conn, True)

        d.virt.append((child, "hkpConvexVerticesShape"))

        for k, block in enumerate(blocks):
            d.f32(pay + k * convex_layout.FOUR_POINTS, *block)

        for k, pe in enumerate(planes):
            d.f32(planes_at + k * 16, *pe)

        if not wants_connectivity(sh):
            continue

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

    # 0xFF, not zero. The virtual-fixup region rarely ends on a whole 12-byte record and a reader
    # that divides the region by the record size sees one extra: with 15 objects the 12 bytes of
    # padding read as a sixteenth. BF3 pads with 0xFF -- measured, it is the only difference in
    # 2,887 of its 7,593 physics resources -- so the phantom decodes as key -1 rather than as
    # class 0, which is a real object.
    while len(d.buf) % 16:
        d.buf += b"\xff"

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


def box(centre, half, radius=0.0, rotation=None, leaf_id=None):
    return dict(kind="box", centre=centre, half=half, radius=radius, rotation=rotation,
                leaf_id=leaf_id)


def convex(centre, verts, planes, radius=0.0, rotation=None, connectivity=True,
           leaf_id=None):
    """verts/planes must already be relative to `centre`."""
    f, kept = convex_layout.faces(verts, planes)

    if len(f) < 4:
        return None                          # not a solid: caller should drop it

    return dict(kind="convex", centre=centre, verts=verts, radius=radius, faces=f,
                planes=[planes[i] for i in kept], rotation=rotation,
                connectivity=connectivity, leaf_id=leaf_id)


def cylinder(centre, vertex_a, vertex_b, cyl_radius, radius=0.0, rotation=None, leaf_id=None):
    return dict(kind="cylinder", centre=centre, vertexA=vertex_a, vertexB=vertex_b,
                cylinderRadius=cyl_radius, radius=radius, rotation=rotation, leaf_id=leaf_id)


def capsule(centre, vertex_a, vertex_b, radius=0.0, rotation=None, leaf_id=None):
    return dict(kind="capsule", centre=centre, vertexA=vertex_a, vertexB=vertex_b, radius=radius,
                rotation=rotation, leaf_id=leaf_id)


def sphere(centre, radius, rotation=None, leaf_id=None):
    return dict(kind="sphere", centre=centre, radius=radius, rotation=rotation, leaf_id=leaf_id)


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

# Classes the builder has a form for. Anything else in a resource is why it cannot be rebuilt --
# hkpMoppCode and hkpCompressedMeshShape are Havok SDK bakes and are not synthesised here.
EMITTABLE = frozenset(["hkRootLevelContainer", "HavokPhysicsContainer", "hkpConvexTranslateShape",
                       "hkpConvexTransformShape", "hkpListShape", "hkpBoxShape",
                       "hkpCylinderShape", "hkpSphereShape", "hkpCapsuleShape",
                       "hkpConvexVerticesShape", "hkpConvexVerticesConnectivity"])


def pad(shapes):
    """A container holding ONE convex shape is padded to two by repeating it.

    MEASURED, one shape type at a time: a lone hkpConvexVerticesShape wedges the server on load --
    every partition logs, then the process stops producing output entirely. A lone hkpBoxShape
    loads. Two convex shapes load. Repeating the shape is harmless: the duplicate occupies the same
    space as its original and collides identically. HAVOK_MIN_SHAPES overrides it.
    """
    out = list(shapes)

    while 0 < len(out) < MIN_SHAPES:
        out.append(out[-1])

    return out


# The MOPP pair is an ACCELERATION structure, not geometry. hkpMoppUtility::buildCode lives in the
# Havok SDK and is not reproducible here, but a bare hkpListShape under the container is an
# arrangement BF3 itself ships in 900 resources -- so a rebuild drops the MOPP and keeps the shapes.
# Everything else outside EMITTABLE carries geometry, and dropping it would silently delete
# collision.
DEGRADES = frozenset(["hkpMoppBvTreeShape", "hkpMoppCode"])


def can_rebuild(classes):
    """-> (bool, blocked, degraded) for the classes a resource holds.

    The honest gate in front of a rebuild. `blocked` means the shapes themselves cannot be produced
    -- an hkpCompressedMeshShape or an extended mesh is a Havok SDK bake -- and such a resource can
    be PRESERVED verbatim, which is what the pipeline already does for an unedited one, but never
    regenerated. `degraded` means it rebuilds correctly and loses its MOPP acceleration.
    """
    unknown = {c for c in classes if c not in EMITTABLE}

    return not (unknown - DEGRADES), sorted(unknown - DEGRADES), sorted(unknown & DEGRADES)


def build(shapes, mass=1.0, wrapper_spec=None, use_list=False):
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
    shapes = pad([box(s[:3], s[3:6], s[6]) if isinstance(s, tuple) else s for s in shapes])

    unbuildable = sorted({sh["kind"] for sh in shapes if sh["kind"] not in
                          ("box", "convex", "cylinder", "sphere", "capsule")})

    if unbuildable:
        # Refuse rather than drop it. A triangle mesh needs an hkpMoppCode and silently omitting
        # the shape would ship a level whose water you fall through.
        raise NotImplementedError(
            "no writer for %s -- an hkpStorageExtendedMeshShape needs a MOPP, which only the "
            "Havok SDK bakes; such a resource can be preserved verbatim but not rebuilt"
            % ", ".join(unbuildable))

    leaves, _leaf_of = plan(shapes)
    cn, names = classnames(used_classes(shapes, leaves, use_list))
    parts, blocks = [], []

    for ptr in (PTR32, PTR64):
        data, virt_off, local, glob = build_data(ptr, shapes, names, use_list)
        block, global_off = fixup_block(local, glob)
        blocks.append(block)
        parts.append((ptr, data, virt_off, len(block), global_off))

    packs = [packfile(p, cn, d, v, bs, go, names["hkRootLevelContainer"])
             for p, d, v, bs, go in parts]

    lo = [min(_extent(s, i, -1) for s in shapes) for i in range(3)]
    hi = [max(_extent(s, i, 1) for s in shapes) for i in range(3)]

    if wrapper_spec:
        # Reproduce the GAME's wrapper rather than a synthetic one. Emitting only the packfiles
        # writes PartCount 1 against a shipped 21 and differs from byte 0. The four arrays follow
        # each other from offset 64, with the byte-wide material indices padded to 16 before the
        # flags array -- measured on MEHouse01Large: 64 -> 400 -> 1072 -> 1104.
        w = wrapper_spec
        trans = w.get('PartTranslations') or []
        aabbs = w.get('LocalAabbs') or []
        midx = w.get('MaterialIndices') or []
        flags = w.get('MaterialFlagsAndIndices') or []

        o_trans = 64
        o_aabbs = o_trans + len(trans) * 16
        o_midx = o_aabbs + len(aabbs) * 32
        o_flags = align(o_midx + len(midx), 16)
        end = align(o_flags + len(flags) * 4, 16)

        wrapper = bytearray(end)
        struct.pack_into("<13I", wrapper, 0, int(w.get('PartCount', 0)),
                         len(trans), o_trans, 0, len(aabbs), o_aabbs, 0,
                         len(midx), o_midx, 0, len(flags), o_flags, 0)
        struct.pack_into("<f", wrapper, 52, float(w.get('Scale', 1.0)))
        struct.pack_into("<I", wrapper, 56,
                         (int(w.get('MaterialCountUsed', 0)) & 0xFF) |
                         ((int(w.get('HighestMaterialIndex', 0)) & 0xFF) << 8))

        for i, t in enumerate(trans):
            struct.pack_into("<4f", wrapper, o_trans + i * 16, t[0], t[1], t[2], 0.0)

        for i, a in enumerate(aabbs):
            struct.pack_into("<8f", wrapper, o_aabbs + i * 32,
                             a[0], a[1], a[2], 0.0, a[3], a[4], a[5], 0.0)

        for i, m in enumerate(midx):
            wrapper[o_midx + i] = int(m) & 0xFF

        for i, f in enumerate(flags):
            struct.pack_into("<I", wrapper, o_flags + i * 4, int(f))

        trailer = struct.pack("<2I", len(blocks[0]), len(blocks[1]))
        trailer += blocks[0] + blocks[1] + struct.pack("<4I", 8, 20, 32, 44)

        return bytes(wrapper) + b"".join(packs) + trailer

    # int[10] is NOT the shape count, whatever it looks like: shipped hk_box carries 2 with three
    # shapes in its container, and hk_pallet carries 3 with two. HAVOK_WRAPPER_COUNT overrides it
    # so the field can be tested on its own.
    count = int(os.environ.get('HAVOK_WRAPPER_COUNT', len(shapes)))

    # The wrapper has to be as long as the arrays it DECLARES. It used to be a flat 128 bytes with
    # a flags count of len(shapes), which is only true up to four shapes: at 89 the declared array
    # ran 240 bytes past the end of the wrapper, and a reader that finds the packfile by adding the
    # array sizes up looked for it inside the flags array and found no Havok magic there.
    end = align(112 + count * 4, 16)
    wrapper = bytearray(end)
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
