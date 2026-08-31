#!/usr/bin/env python3
"""Turn a DDS the browser cannot read into a PNG it can.

BF3's normal maps are BC5 in a DX10-header DDS. three.js's DDSLoader handles neither, and it does
not fail loudly -- it returns a texture with no image behind it, which throws inside the renderer.
Rather than lose them, decode here.

BC5 is two BC4 channels (red, green) at 8 bytes each per 4x4 block; Z is reconstructed, since a
unit normal's third component follows from the other two.
"""
import struct

import numpy as np

DDS_MAGIC = b'DDS '
HEADER = 124
DX10_BC5_UNORM = 83
DX10_BC5_SNORM = 84


def _bc4_channel(blocks, width, height, signed=False):
    """Decode one BC4 channel into a (height, width) uint8 array."""
    bx, by = (width + 3) // 4, (height + 3) // 4
    out = np.zeros((by * 4, bx * 4), dtype=np.uint8)

    e0 = blocks[:, 0].astype(np.int32)
    e1 = blocks[:, 1].astype(np.int32)

    # The 16 three-bit indices live in six bytes, little-endian.
    bits = np.zeros(len(blocks), dtype=np.uint64)
    for i in range(6):
        bits |= blocks[:, 2 + i].astype(np.uint64) << np.uint64(8 * i)

    palette = np.zeros((len(blocks), 8), dtype=np.float32)
    palette[:, 0] = e0
    palette[:, 1] = e1

    wide = e0 > e1

    for i in range(1, 7):
        # Eight-value palette when e0 > e1, six values plus 0 and 255 otherwise.
        palette[wide, i + 1] = ((7 - i) * e0[wide] + i * e1[wide]) / 7.0

    for i in range(1, 5):
        palette[~wide, i + 1] = ((5 - i) * e0[~wide] + i * e1[~wide]) / 5.0

    palette[~wide, 6] = 0
    palette[~wide, 7] = 255

    for texel in range(16):
        index = ((bits >> np.uint64(3 * texel)) & np.uint64(7)).astype(np.int32)
        values = palette[np.arange(len(blocks)), index]

        row = (np.arange(len(blocks)) // bx) * 4 + texel // 4
        col = (np.arange(len(blocks)) % bx) * 4 + texel % 4
        out[row, col] = np.clip(values, 0, 255).astype(np.uint8)

    return out[:height, :width]


def decode(path):
    """Returns (width, height, RGB ndarray) for a BC5 DDS, or None if it is not one."""
    with open(path, 'rb') as handle:
        data = handle.read()

    if data[:4] != DDS_MAGIC:
        return None

    height, width = struct.unpack_from('<II', data, 12)
    four_cc = data[84:88]
    offset = 4 + HEADER

    if four_cc == b'DX10':
        dxgi = struct.unpack_from('<I', data, offset)[0]
        offset += 20

        if dxgi not in (DX10_BC5_UNORM, DX10_BC5_SNORM):
            return None
    elif four_cc in (b'ATI2', b'BC5U'):
        pass
    else:
        return None

    bx, by = (width + 3) // 4, (height + 3) // 4
    needed = bx * by * 16

    if len(data) - offset < needed:
        return None

    raw = np.frombuffer(data, dtype=np.uint8, count=needed, offset=offset).reshape(-1, 16)

    red = _bc4_channel(raw[:, :8], width, height)
    green = _bc4_channel(raw[:, 8:], width, height)

    # Reconstruct Z from X and Y: the map stores a unit normal with the third component dropped.
    x = red.astype(np.float32) / 127.5 - 1.0
    y = green.astype(np.float32) / 127.5 - 1.0
    z = np.sqrt(np.clip(1.0 - x * x - y * y, 0.0, 1.0))

    rgb = np.empty((height, width, 3), dtype=np.uint8)
    rgb[..., 0] = red
    rgb[..., 1] = green
    rgb[..., 2] = np.clip((z + 1.0) * 127.5, 0, 255).astype(np.uint8)

    return width, height, rgb


def to_png(source, destination):
    """Writes `source` as a PNG. Returns False when the format needs no conversion."""
    decoded = decode(source)

    if decoded is None:
        return False

    from PIL import Image

    Image.fromarray(decoded[2], 'RGB').save(destination, 'PNG')

    return True
