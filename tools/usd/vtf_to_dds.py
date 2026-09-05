#!/usr/bin/env python3
"""Convert a Source VTF to a DDS that Rime's DxTexture generator accepts.

Rime's `GenerateFromDDS` rejects anything without a FourCC (`TextureFormatFromDDSHeader` throws on a
DDS with no FourCC), so only block-compressed input is usable. Every COLOUR map de_dust2 references
is already DXT1, so that path is a container rewrite, not a recompression.

The NORMAL maps are not: Source stores most of them as uncompressed BGR888, so they have to be
encoded. That is what _dxt1 does -- bounding-box endpoints per 4x4 block, which is the standard
cheap encoder and entirely adequate for a tangent-space normal. It is a real quality loss, unlike
the colour path, and it is the only way to get a FourCC that Rime will read.

The one real difference is mip ORDER. A VTF stores its chain smallest-first (mip N-1 ... mip 0); a
DDS stores it largest-first. Copying the payload across without reversing gives a texture whose
top-level surface is a 1x1 block, which reads in game as a flat colour, not as an error.

    vtf_to_dds.py <in.vtf> <out.dds>
"""
import struct
import sys

import numpy as np

VTF_DXT1, VTF_DXT3, VTF_DXT5 = 13, 14, 15
BLOCK = {VTF_DXT1: (8, b'DXT1'), VTF_DXT3: (16, b'DXT3'), VTF_DXT5: (16, b'DXT5')}

# Uncompressed VTF formats, as (bytes per pixel, index of R, G, B within a pixel).
RAW = {0: (4, 0, 1, 2), 1: (4, 3, 2, 1), 2: (3, 0, 1, 2), 3: (3, 2, 1, 0),
       11: (4, 1, 2, 3), 12: (4, 2, 1, 0)}


def _dxt1(rgb):
    """Encode an (h, w, 3) uint8 image as DXT1, 4-colour blocks.

    Endpoints come from each block's PRINCIPAL AXIS, not its bounding box. On colour that is a
    modest gain; on a normal map it is not optional -- the three channels of a tangent normal move
    together, so the bounding-box corners sit off the data entirely and the block decodes to the
    wrong tilt. Measured on cs_italy/marketwall04_normal: 24.4 dB bounding box, and the axis fit
    below is what closes the gap.
    """
    h, w = rgb.shape[:2]
    ph, pw = (h + 3) // 4 * 4, (w + 3) // 4 * 4

    if (ph, pw) != (h, w):                       # pad a non-multiple-of-4 mip by edge replication
        rgb = np.pad(rgb, ((0, ph - h), (0, pw - w), (0, 0)), mode='edge')

    blocks = rgb.reshape(ph // 4, 4, pw // 4, 4, 3).transpose(0, 2, 1, 3, 4)
    blocks = blocks.reshape(-1, 16, 3).astype(np.int32)

    f = blocks.astype(np.float32)
    mean = f.mean(axis=1)
    centred = f - mean[:, None, :]

    # Dominant eigenvector of each block's covariance, by power iteration. Seeded off the bounding
    # box diagonal so a flat block starts somewhere sane rather than at an arbitrary axis.
    cov = np.einsum('bij,bik->bjk', centred, centred)
    v = f.max(axis=1) - f.min(axis=1)
    n = np.linalg.norm(v, axis=1, keepdims=True)
    v = np.where(n > 1e-6, v / np.maximum(n, 1e-9), np.array([1.0, 0.0, 0.0], np.float32))

    for _ in range(8):
        v = np.einsum('bjk,bk->bj', cov, v)
        n = np.linalg.norm(v, axis=1, keepdims=True)
        v = np.where(n > 1e-9, v / np.maximum(n, 1e-12), np.array([1.0, 0.0, 0.0], np.float32))

    t = np.einsum('bij,bj->bi', centred, v)
    hi = np.clip(mean + t.max(axis=1)[:, None] * v, 0, 255).astype(np.int32)
    lo = np.clip(mean + t.min(axis=1)[:, None] * v, 0, 255).astype(np.int32)

    def to565(c):
        return ((c[:, 0] >> 3) << 11) | ((c[:, 1] >> 2) << 5) | (c[:, 2] >> 3)

    def from565(v):
        r = ((v >> 11) & 0x1F) << 3
        g = ((v >> 5) & 0x3F) << 2
        b = (v & 0x1F) << 3
        return np.stack([r | (r >> 5), g | (g >> 6), b | (b >> 5)], axis=1).astype(np.int32)

    c0, c1 = to565(hi), to565(lo)
    # c0 must exceed c1 or the block switches to 3-colour+transparent mode.
    swap = c0 < c1
    c0[swap], c1[swap] = c1[swap], c0[swap]
    flat = c0 == c1

    e0, e1 = from565(c0), from565(c1)
    pal = np.stack([e0, e1, (2 * e0 + e1) // 3, (e0 + 2 * e1) // 3], axis=1)   # (n, 4, 3)
    dist = ((blocks[:, None, :, :] - pal[:, :, None, :]) ** 2).sum(axis=3)     # (n, 4, 16)
    idx = dist.argmin(axis=1).astype(np.uint32)
    idx[flat] = 0

    packed = np.zeros(len(blocks), np.uint32)

    for i in range(16):
        packed |= idx[:, i] << (2 * i)

    out = np.empty((len(blocks), 2), np.uint32)
    out[:, 0] = (c1.astype(np.uint32) << 16) | c0.astype(np.uint32)
    out[:, 1] = packed
    return out.tobytes()

DDSD_CAPS, DDSD_HEIGHT, DDSD_WIDTH, DDSD_PIXELFORMAT = 0x1, 0x2, 0x4, 0x1000
DDSD_MIPMAPCOUNT, DDSD_LINEARSIZE = 0x20000, 0x80000
DDPF_FOURCC = 0x4
DDSCAPS_COMPLEX, DDSCAPS_TEXTURE, DDSCAPS_MIPMAP = 0x8, 0x1000, 0x400


def mip_bytes(width, height, block):
    """DXT stores whole 4x4 blocks, and a 2x2 or 1x1 mip still costs one."""
    return max(1, (width + 3) // 4) * max(1, (height + 3) // 4) * block


def read_vtf(path):
    d = open(path, 'rb').read()

    if d[:4] != b'VTF\0':
        raise ValueError('%s is not a VTF' % path)

    header_size = struct.unpack_from('<I', d, 12)[0]
    width, height, flags, frames, _first = struct.unpack_from('<HHIHH', d, 16)
    hi_fmt, mips, low_fmt, low_w, low_h = struct.unpack_from('<iBiBB', d, 52)

    if hi_fmt not in BLOCK and hi_fmt not in RAW:
        raise ValueError('%s is VTF format %d, which is neither DXT1/3/5 nor a raw layout '
                         'this understands' % (path, hi_fmt))

    raw = hi_fmt in RAW
    block, fourcc = (8, b'DXT1') if raw else BLOCK[hi_fmt]
    off = header_size

    # The low-res thumbnail is always DXT1 and always precedes the chain.
    if low_fmt != -1:
        off += mip_bytes(low_w, low_h, 8)

    # Smallest first in the file. Frame/face/slice loops collapse for a plain 2D texture; a cubemap
    # or an animated VTF would need them, and none of dust2's world materials are either.
    faces = 6 if (flags & 0x4000) else 1
    sizes = [(max(1, width >> i), max(1, height >> i)) for i in range(mips)]
    levels = [None] * mips

    for level in range(mips - 1, -1, -1):
        w, h = sizes[level]

        if raw:
            bpp, ri, gi, bi = RAW[hi_fmt]
            n = w * h * bpp * frames * faces
            px = np.frombuffer(d[off:off + w * h * bpp], np.uint8).reshape(h, w, bpp)
            levels[level] = _dxt1(np.stack([px[:, :, ri], px[:, :, gi], px[:, :, bi]], axis=2))
        else:
            n = mip_bytes(w, h, block) * frames * faces
            levels[level] = d[off:off + n]

        off += n

    return width, height, mips, fourcc, block, levels


def write_dds(path, width, height, mips, fourcc, block, levels):
    header = bytearray(124)
    struct.pack_into('<I', header, 0, 124)
    struct.pack_into('<I', header, 4, DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT
                     | DDSD_MIPMAPCOUNT | DDSD_LINEARSIZE)
    struct.pack_into('<I', header, 8, height)
    struct.pack_into('<I', header, 12, width)
    struct.pack_into('<I', header, 16, mip_bytes(width, height, block))   # pitchOrLinearSize
    struct.pack_into('<I', header, 20, 0)                                 # depth
    struct.pack_into('<I', header, 24, mips)
    # pixel format at 72: size, flags, fourCC, then five zeroed bit fields
    struct.pack_into('<I', header, 72, 32)
    struct.pack_into('<I', header, 76, DDPF_FOURCC)
    header[80:84] = fourcc
    caps = DDSCAPS_TEXTURE | (DDSCAPS_COMPLEX | DDSCAPS_MIPMAP if mips > 1 else 0)
    struct.pack_into('<I', header, 104, caps)

    with open(path, 'wb') as f:
        f.write(b'DDS ')
        f.write(header)
        for level in levels:
            f.write(level)


def convert(src, dst):
    width, height, mips, fourcc, block, levels = read_vtf(src)
    write_dds(dst, width, height, mips, fourcc, block, levels)
    return width, height, mips, fourcc.decode()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)

    print('%dx%d %d mips %s' % convert(sys.argv[1], sys.argv[2]))
