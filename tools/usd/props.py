#!/usr/bin/env python3
"""dust2's static props: 321 placements of 53 models, as USD prototypes and instances.

The BSP's static prop lump gives a model index, a position and Euler angles per instance. The
models themselves are external .mdl/.vvd/.vtx files, read by mdl.py.

Each distinct model is authored ONCE as a prototype and every placement is an Xform that references
it and is marked instanceable -- the same arrangement export_level_usd uses for BF3's own 6185
placements, and the reason a level stays a few MB instead of duplicating geometry per instance.

Source angles are (pitch, yaw, roll) applied as Rz(yaw) Ry(pitch) Rx(roll), in a Z-up frame. The
axis map to BF3 is a change of basis, so the rotation has to be conjugated by it -- rotating the
axes without conjugating leaves props standing at the right place facing the wrong way.
"""
import math
import struct

import numpy as np

INCH = 0.0254
L_GAME_LUMP = 35
# Source Z-up -> BF3 Y-up: (x, y, z) -> (x, z, -y).
BASIS = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]])


def _angles_to_matrix(pitch, yaw, roll):
    p, y, r = (math.radians(a) for a in (pitch, yaw, roll))
    cp, sp = math.cos(p), math.sin(p)
    cy, sy = math.cos(y), math.sin(y)
    cr, sr = math.cos(r), math.sin(r)
    return np.array([
        [cp * cy, sr * sp * cy - cr * sy, cr * sp * cy + sr * sy],
        [cp * sy, sr * sp * sy + cr * cy, cr * sp * sy - sr * cy],
        [-sp,     sr * cp,                cr * cp],
    ])


def placements(bsp_path):
    """-> (model names, [(model index, position, 3x3 rotation) ...]) in Source space."""
    blob = open(bsp_path, 'rb').read()
    lumps = [struct.unpack_from('<4i', blob, 8 + i * 16) for i in range(64)]
    ofs, ln, _v, _c = lumps[L_GAME_LUMP]
    gl = blob[ofs:ofs + ln]
    count = struct.unpack_from('<i', gl, 0)[0]

    for k in range(count):
        gid, _flags, _ver, g_ofs, g_len = struct.unpack_from('<iHHii', gl, 4 + k * 16)

        if struct.pack('<i', gid)[::-1] != b'sprp':
            continue

        d = blob[g_ofs:g_ofs + g_len]
        n_names = struct.unpack_from('<i', d, 0)[0]
        names = [d[4 + i * 128:4 + i * 128 + 128].split(b'\0')[0].decode('latin1')
                 for i in range(n_names)]
        p = 4 + n_names * 128
        n_leaf = struct.unpack_from('<i', d, p)[0]
        p += 4 + n_leaf * 2
        n_props = struct.unpack_from('<i', d, p)[0]
        p += 4
        stride = (g_len - p) // n_props if n_props else 0
        out = []

        for i in range(n_props):
            e = p + i * stride
            x, y, z, pitch, yaw, roll, idx = struct.unpack_from('<6fH', d, e)
            out.append((idx, (x, y, z), _angles_to_matrix(pitch, yaw, roll)))

        return names, out

    return [], []


def to_bf3(position, rotation, shift):
    """Source position/rotation -> BF3 metres, Y-up, centred like the world geometry."""
    p = BASIS @ (np.array(position) * INCH) - np.asarray(shift)
    r = BASIS @ rotation @ BASIS.T
    return p, r


if __name__ == '__main__':
    import sys
    import collections

    names, props = placements(sys.argv[1] if len(sys.argv) > 1 else '/tmp/dust2/de_dust2.bsp')
    print('%d models, %d placements' % (len(names), len(props)))
    c = collections.Counter(names[i] for i, _p, _r in props)

    for n, k in c.most_common(5):
        print('   %-52s x%d' % (n, k))

    rotated = sum(1 for _i, _p, r in props if abs(np.trace(r) - 3.0) > 1e-6)
    print('placements with a non-identity rotation: %d of %d' % (rotated, len(props)))
