#!/usr/bin/env python3
"""Vertex/index chunk codec for BF3 MeshSets — decode AND encode.

A MeshSet resource carries only the layout. The geometry lives in a separate
chunk, whose id is MeshLayout.DataChunkId, laid out as:

    [ vertex block : MeshLayout.VertexDataSize ][ index block : IndexDataSize ]

VERIFIED by decoding objects/loadingpallet_01/loadingpallet_01_mesh lod0: with
the vertex block first, the Half3 positions reproduce the MeshSetLayout AABB
(min -0.5, 0.0, -0.815 / max 0.505, 0.18, 0.825) exactly; read the other way
round they saturate to +/-1.

Subset.VertexOffset is a BYTE offset into the vertex block; Subset.StartIndex is
an ELEMENT offset into the index block. Each subset's vertices are packed
according to its own GeometryDeclarationDesc, so stride and element set vary
between subsets of the same LOD (the ZOnly subset is usually position-only).
"""

import struct
import numpy as np

# fb::VertexElementUsage
USAGE = {
    1: "Pos", 2: "BoneIndices", 4: "BoneWeights", 6: "Normal", 7: "Tangent",
    8: "Binormal", 9: "BinormalSign", 30: "Color0", 31: "Color1",
    33: "TexCoord0", 34: "TexCoord1", 35: "TexCoord2", 36: "TexCoord3",
    # 37 is TexCoord4: the texcoord ids are contiguous from 33, and the four
    # declarations that use it also declare TexCoord0-3 in the same subset.
    37: "TexCoord4",
    41: "RadiosityTexCoord",
}
# Usage 50 (u1[4], 339 of 7679 subsets in the dump corpus) is deliberately NOT
# named. No chunk-backed sample exists to measure it against, and a wrong name
# is worse than none. It still round-trips: unnamed usages export at their full
# declared width as a "bf3_usage50" primvar, so nothing is dropped.

# fb::VertexElementFormat -> (numpy dtype, component count, normalised)
FORMAT = {
    1: ("<f4", 1, False), 2: ("<f4", 2, False), 3: ("<f4", 3, False), 4: ("<f4", 4, False),
    5: ("<f2", 1, False), 6: ("<f2", 2, False), 7: ("<f2", 3, False), 8: ("<f2", 4, False),
    10: ("i1", 4, False), 11: ("i1", 4, True), 12: ("u1", 4, False), 13: ("u1", 4, True),
    14: ("<i2", 1, False), 15: ("<i2", 2, False), 16: ("<i2", 3, False), 17: ("<i2", 4, False),
    18: ("<i2", 1, True), 19: ("<i2", 2, True), 20: ("<i2", 3, True), 21: ("<i2", 4, True),
    22: ("<u2", 2, False), 23: ("<u2", 4, False), 24: ("<u2", 2, True), 25: ("<u2", 4, True),
    32: ("<u4", 1, False), 33: ("<u4", 2, False), 34: ("<u4", 4, False),
    50: ("u1", 1, True),
}

_NORM = {"i1": 127.0, "u1": 255.0, "<i2": 32767.0, "<u2": 65535.0}


def element_size(fmt):
    dt, n, _ = FORMAT[fmt]
    return np.dtype(dt).itemsize * n


def decode_subset(chunk, lod, subset):
    """Return {usage_name: (count, ncomp) float array} plus 'indices'.

    Values are returned raw (normalised formats are scaled to [-1,1]/[0,1]).
    Unsupported formats raise, rather than being silently dropped — the point of
    this codec is that what it cannot represent, it refuses.
    """
    vblock = chunk[:lod.vertex_data_size]
    iblock = chunk[lod.vertex_data_size:lod.vertex_data_size + lod.index_data_size]

    out = {}
    stride = subset.vertex_stride
    base = subset.vertex_offset
    n = subset.vertex_count
    raw = np.frombuffer(vblock, dtype=np.uint8, count=n * stride, offset=base).reshape(n, stride)

    for e in subset.geom_decl.elements[:subset.geom_decl.element_count]:
        if e.fmt not in FORMAT:
            raise NotImplementedError("vertex format %d (usage %d)" % (e.fmt, e.usage))
        dt, ncomp, norm = FORMAT[e.fmt]
        size = element_size(e.fmt)
        cols = raw[:, e.offset:e.offset + size].copy()
        vals = cols.view(np.dtype(dt)).reshape(n, ncomp).astype(np.float32)
        if norm:
            vals = vals / _NORM[dt]
        out[USAGE.get(e.usage, "usage%d" % e.usage)] = vals

    if lod.index_buffer_format != 0:
        raise NotImplementedError("index buffer format %d" % lod.index_buffer_format)
    if subset.primitive_type != 3:
        raise NotImplementedError("primitive type %d" % subset.primitive_type)
    idx = np.frombuffer(iblock, dtype="<u2", count=subset.primitive_count * 3,
                        offset=subset.start_index * 2).reshape(-1, 3).astype(np.uint32)
    out["indices"] = idx
    return out


def encode_subset(attrs, subset):
    """Inverse of decode_subset for one subset's vertex block, honouring the
    subset's existing GeometryDeclarationDesc exactly (same stride, same element
    offsets, same formats). Returns the packed vertex bytes."""
    n = subset.vertex_count
    stride = subset.vertex_stride
    raw = np.zeros((n, stride), dtype=np.uint8)
    for e in subset.geom_decl.elements[:subset.geom_decl.element_count]:
        name = USAGE.get(e.usage, "usage%d" % e.usage)
        if name not in attrs:
            continue
        dt, ncomp, norm = FORMAT[e.fmt]
        vals = np.asarray(attrs[name], dtype=np.float32).reshape(n, ncomp)
        if norm:
            vals = np.rint(vals * _NORM[dt])
        packed = vals.astype(np.dtype(dt)).view(np.uint8).reshape(n, -1)
        raw[:, e.offset:e.offset + packed.shape[1]] = packed
    return raw.tobytes()


def rebuild_chunk(lod, per_subset_attrs):
    """Reassemble a whole LOD chunk from per-subset attribute dicts."""
    vblock = bytearray(lod.vertex_data_size)
    iblock = bytearray(lod.index_data_size)
    for sub, attrs in zip(lod.subsets, per_subset_attrs):
        vb = encode_subset(attrs, sub)
        vblock[sub.vertex_offset:sub.vertex_offset + len(vb)] = vb
        idx = np.asarray(attrs["indices"], dtype="<u2").reshape(-1)
        off = sub.start_index * 2
        iblock[off:off + idx.nbytes] = idx.tobytes()
    return bytes(vblock) + bytes(iblock)
