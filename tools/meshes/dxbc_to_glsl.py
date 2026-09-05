#!/usr/bin/env python3
"""Translate a DXBC pixel shader into GLSL.

BF3 ships each surface shader as compiled DX11 bytecode inside its ShaderSolution permutation, so
rendering a BF3 material faithfully -- rather than approximating it -- means executing that
bytecode. Nothing on this machine translates DXBC (no spirv-cross, no glslang, no dxc; DXVK is
present only as compiled DLLs), so this is the translator.

Scope: straight-line pixel shaders. The mesh G-buffer permutation that motivated it is 54
instructions with no flow control, three texture samples and four render targets.

Operand encoding, which is the part the instruction decoder did not need:
  bits 0-1    component count (0 zero, 1 one, 2 four, 3 N)
  bits 2-3    selection mode when 4-component: 0 mask, 1 swizzle, 2 select-one
  bits 4-11   the mask / swizzle / selection itself
  bits 12-19  operand type (temp, input, output, immediate, sampler, resource, cbuffer, ...)
  bits 20-21  index dimension
  bits 22-30  how each index is represented (immediate, relative, ...)
  bit  31     extended token follows (carries source modifiers such as negate/abs)

    dxbc_to_glsl.py <file.dxbc>
"""
import struct
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from dxbc_decode import chunks, OPCODES, DECLARATIONS   # noqa: E402

TYPE_TEMP, TYPE_INPUT, TYPE_OUTPUT, TYPE_INDEXABLE_TEMP = 0, 1, 2, 3
TYPE_IMMEDIATE32, TYPE_SAMPLER, TYPE_RESOURCE, TYPE_CBUFFER = 4, 6, 7, 8

SWZ = 'xyzw'


class Operand:
    def __init__(self):
        self.type = 0
        self.indices = []
        self.swizzle = None      # e.g. 'xyzw'
        self.mask = None         # e.g. 'xy'
        self.immediates = []
        self.neg = False
        self.abs = False

    def glsl(self):
        """Render as a GLSL expression."""
        if self.type == TYPE_IMMEDIATE32:
            vals = ', '.join('%g' % v for v in self.immediates)
            base = 'vec4(%s)' % vals if len(self.immediates) == 4 else '%g' % self.immediates[0]
            return base

        if not self.indices and self.type in (TYPE_TEMP, TYPE_INPUT, TYPE_OUTPUT):
            return '<no-index type%d>' % self.type

        if self.type == TYPE_TEMP:
            base = 'r%d' % self.indices[0]
        elif self.type == TYPE_INPUT:
            base = 'v%d' % self.indices[0]
        elif self.type == TYPE_OUTPUT:
            base = 'o%d' % self.indices[0]
        elif self.type == TYPE_CBUFFER:
            # cb<binding>[<row>] -- a float4 row of a constant buffer.
            base = 'cb%d[%d]' % (self.indices[0], self.indices[1]) if len(self.indices) > 1 \
                else 'cb%d' % self.indices[0]
        elif self.type == TYPE_RESOURCE:
            return 't%d' % self.indices[0]
        elif self.type == TYPE_SAMPLER:
            return 's%d' % self.indices[0]
        else:
            base = 'unk%d_%s' % (self.type, '_'.join(str(i) for i in self.indices))

        if self.swizzle:
            base += '.' + self.swizzle

        if self.abs:
            base = 'abs(%s)' % base

        if self.neg:
            base = '-(%s)' % base

        return base

    def dest(self):
        base = self.glsl()
        return base


def read_operand(body, pos):
    token = struct.unpack_from('<I', body, pos)[0]
    pos += 4
    op = Operand()

    comps = token & 0x3
    sel = (token >> 2) & 0x3
    op.type = (token >> 12) & 0xFF
    dims = (token >> 20) & 0x3
    reps = [(token >> (22 + 3 * i)) & 0x7 for i in range(3)]
    extended = (token >> 31) & 1

    if extended:
        ext = struct.unpack_from('<I', body, pos)[0]
        pos += 4

        if (ext & 0x3F) == 1:                       # operand modifier
            mod = (ext >> 6) & 0xFF
            op.neg = mod in (0x01, 0x03)
            op.abs = mod in (0x02, 0x03)

    # NumComponents: 0 = zero, 1 = one, 2 = FOUR, 3 = N. Reading 1 as four-component means no
    # mask or swizzle is ever parsed, and every operand silently loses its component selection.
    if comps == 2:                                  # 4-component
        bits = (token >> 4) & 0xFF

        if sel == 0:                                # mask
            op.mask = ''.join(SWZ[i] for i in range(4) if bits & (1 << i)) or None
        elif sel == 1:                              # swizzle
            op.swizzle = ''.join(SWZ[(bits >> (2 * i)) & 0x3] for i in range(4))
        elif sel == 2:                              # select one
            op.swizzle = SWZ[bits & 0x3]

    if op.type == TYPE_IMMEDIATE32:
        n = 4 if comps == 2 else 1

        for _ in range(n):
            op.immediates.append(struct.unpack_from('<f', body, pos)[0])
            pos += 4

        return op, pos

    for d in range(dims):
        rep = reps[d]

        if rep in (0, 2):                           # imm32, or relative (index token follows)
            op.indices.append(struct.unpack_from('<I', body, pos)[0])
            pos += 4
        elif rep == 1:                              # imm64
            op.indices.append(struct.unpack_from('<Q', body, pos)[0])
            pos += 8
        elif rep == 3:                              # imm32 + relative
            op.indices.append(struct.unpack_from('<I', body, pos)[0])
            pos += 4
            _, pos = read_operand(body, pos)
        else:
            op.indices.append(0)

    return op, pos


def instructions(body):
    end = struct.unpack_from('<I', body, 4)[0] * 4
    pos = 8
    out = []

    while pos + 4 <= end:
        token = struct.unpack_from('<I', body, pos)[0]
        opcode = token & 0x7FF
        length = (token >> 24) & 0x7F

        if opcode == 53:
            length = struct.unpack_from('<I', body, pos + 4)[0]

        if length == 0:
            break

        name = OPCODES.get(opcode, 'op%d' % opcode)
        limit = pos + length * 4
        p = pos + 4

        # An EXTENDED OPCODE token follows the opcode when bit 31 is set (sample carries texture
        # offsets there). Read as an operand it shifts every real operand along by one, which is
        # how the destination came out as `<no-index>` and a varying ended up where the sampler
        # belongs. Each extended token sets bit 31 again if another follows.
        ext_word = token

        while (ext_word >> 31) & 1 and p + 4 <= limit:
            ext_word = struct.unpack_from('<I', body, p)[0]
            p += 4

        operands = []

        if opcode not in DECLARATIONS and opcode != 53:
            while p < limit:
                try:
                    o, p = read_operand(body, p)
                except Exception:
                    break

                operands.append(o)

        out.append((name, opcode, operands, body[pos:limit]))
        pos = limit

    return out


# opcode -> a GLSL template. {d} destination, {0}.. sources.
BINARY = {
    'add': '{0} + {1}', 'mul': '{0} * {1}', 'div': '{0} / {1}',
    'min': 'min({0}, {1})', 'max': 'max({0}, {1})',
    'dp2': 'dot(({0}).xy, ({1}).xy)', 'dp3': 'dot(({0}).xyz, ({1}).xyz)',
    'dp4': 'dot({0}, {1})',
}
UNARY = {
    'mov': '{0}', 'sqrt': 'sqrt({0})', 'rsq': 'inversesqrt({0})',
    'exp': 'exp2({0})', 'log': 'log2({0})', 'frc': 'fract({0})',
    'round_pi': 'ceil({0})', 'round_ni': 'floor({0})', 'round_z': 'trunc({0})',
    'round_ne': 'roundEven({0})',
}

# A DXBC temp register is four typeless 32-bit lanes: the same bits are read as float by `add` and
# as int by `iadd`, in the same shader. GLSL has no such type, so integer and comparison opcodes
# reinterpret rather than convert -- floatBitsToInt / intBitsToFloat -- which is what makes this a
# translation instead of an approximation. Converting with float()/int() would silently change the
# value whenever a shader packs bits, which BF3's surface shaders do constantly.
PAD = '  '
INT_BINARY = {
    'iadd': '{0} + {1}', 'imul': '{0} * {1}', 'ishl': '{0} << {1}',
    'ishr': '{0} >> {1}', 'and': '{0} & {1}', 'or': '{0} | {1}',
    'xor': '{0} ^ {1}', 'imin': 'min({0}, {1})', 'imax': 'max({0}, {1})',
}
# Comparisons write an integer bitmask (all ones / all zeros), not a bool.
CMP = {
    'lt': '{0} < {1}', 'ge': '{0} >= {1}', 'eq': '{0} == {1}', 'ne': '{0} != {1}',
    'ilt': '{0} < {1}', 'ige': '{0} >= {1}', 'ieq': '{0} == {1}', 'ine': '{0} != {1}',
    'ult': '{0} < {1}', 'uge': '{0} >= {1}',
}
INT_CMP = {'ilt', 'ige', 'ieq', 'ine', 'ult', 'uge'}


def _width(mask):
    return len(mask) if mask else 4


def _ivec(n, expr):
    return expr if n == 1 else 'ivec%d(%s)' % (n, expr)


def _as_int(expr, n):
    return 'floatBitsToInt(%s)' % expr if n == 1 else 'floatBitsToInt(%s)' % expr


def _as_float(expr, n):
    return 'intBitsToFloat(%s)' % expr


def emit(shader_path):
    data = open(shader_path, 'rb').read()
    parts = chunks(data)
    body = parts.get('SHEX') or parts.get('SHDR')
    lines = []
    temps = 0
    depth = 0

    for name, opcode, ops, _raw in instructions(body):
        if name == 'dcl_temps':
            continue

        if opcode in DECLARATIONS or name == 'ret':
            continue

        d = ops[0].dest() if ops else '?'
        mask = ('.' + ops[0].mask) if ops and ops[0].mask else ''
        src = [o.glsl() for o in ops[1:]]
        n = _width(ops[0].mask if ops else None)
        pad = PAD * (depth + 1)

        if name in BINARY and len(src) >= 2:
            lines.append('%s%s%s = %s;' % (pad, d, mask, BINARY[name].format(*src)))
        elif name in UNARY and len(src) >= 1:
            lines.append('%s%s%s = %s;' % (pad, d, mask, UNARY[name].format(*src)))
        elif name == 'mad' and len(src) >= 3:
            lines.append('%s%s%s = %s * %s + %s;' % (pad, d, mask, src[0], src[1], src[2]))
        elif name == 'sample' and len(src) >= 2:
            # operands: dest, coord, resource, sampler
            lines.append('%s%s%s = texture(%s, (%s).xy);' % (pad, d, mask, src[1], src[0]))
        elif name == 'sample_l' and len(src) >= 3:
            lod = src[3] if len(src) > 3 else '0.0'
            lines.append('%s%s%s = textureLod(%s, (%s).xy, %s);' % (pad, d, mask, src[1], src[0], lod))
        elif name in INT_BINARY and len(src) >= 2:
            expr = INT_BINARY[name].format(_as_int(src[0], n), _as_int(src[1], n))
            lines.append('%s%s%s = %s;' % (pad, d, mask, _as_float('(%s)' % expr, n)))
        elif name == 'imad' and len(src) >= 3:
            expr = '%s * %s + %s' % (_as_int(src[0], n), _as_int(src[1], n), _as_int(src[2], n))
            lines.append('%s%s%s = %s;' % (pad, d, mask, _as_float('(%s)' % expr, n)))
        elif name in CMP and len(src) >= 2:
            a, b = (_as_int(src[0], n), _as_int(src[1], n)) if name in INT_CMP else (src[0], src[1])
            cond = CMP[name].format(a, b)
            # true is 0xFFFFFFFF, false is 0 -- shaders and/or these masks together.
            if n == 1:
                lines.append('%s%s%s = intBitsToFloat((%s) ? -1 : 0);' % (pad, d, mask, cond))
            else:
                lines.append('%s%s%s = intBitsToFloat(mix(ivec%d(0), ivec%d(-1), %s));'
                             % (pad, d, mask, n, n, cond.replace('<', '<').strip()))
        elif name == 'utof' and len(src) >= 1:
            lines.append('%s%s%s = %s;' % (pad, d, mask,
                         'float(floatBitsToUint(%s))' % src[0] if n == 1
                         else 'vec%d(floatBitsToUint(%s))' % (n, src[0])))
        elif name == 'itof' and len(src) >= 1:
            lines.append('%s%s%s = %s;' % (pad, d, mask,
                         'float(floatBitsToInt(%s))' % src[0] if n == 1
                         else 'vec%d(floatBitsToInt(%s))' % (n, src[0])))
        elif name == 'ftou' and len(src) >= 1:
            lines.append('%s%s%s = uintBitsToFloat(%s);' % (pad, d, mask,
                         'uint(%s)' % src[0] if n == 1 else 'uvec%d(%s)' % (n, src[0])))
        elif name == 'ftoi' and len(src) >= 1:
            lines.append('%s%s%s = intBitsToFloat(%s);' % (pad, d, mask,
                         'int(%s)' % src[0] if n == 1 else 'ivec%d(%s)' % (n, src[0])))
        elif name == 'ld' and len(src) >= 2:
            # ld dest, coord, resource -- an unfiltered fetch: xyz are integer texel coords, w the
            # mip level. texelFetch is the exact equivalent, not a sampled approximation.
            lines.append('%s%s%s = texelFetch(%s, ivec2((%s).xy), int((%s).w));'
                         % (pad, d, mask, src[1], src[0], src[0]))
        elif name in ('if_nz', 'if_z', 'if'):
            test = src[0] if src else ops[0].glsl()
            op = '==' if name == 'if_z' else '!='
            lines.append('%sif (floatBitsToUint(%s) %s 0u) {' % (pad, test, op))
            depth += 1
        elif name == 'else':
            lines.append('%s} else {' % PAD * 0 if False else '%s} else {' % (PAD * (depth - 1)))
        elif name == 'endif':
            depth = max(0, depth - 1)
            lines.append('%s}' % (PAD * (depth + 1)))
        elif name in ('discard', 'discard_nz', 'discard_z'):
            test = src[0] if src else ops[0].glsl()
            op = '==' if name == 'discard_z' else '!='
            lines.append('%sif (floatBitsToUint(%s) %s 0u) discard;' % (pad, test, op))
        elif name in ('loop',):
            lines.append('%swhile (true) {' % pad)
            depth += 1
        elif name in ('endloop',):
            depth = max(0, depth - 1)
            lines.append('%s}' % (PAD * (depth + 1)))
        elif name in ('break', 'breakc_nz', 'breakc_z'):
            if name == 'break':
                lines.append('%sbreak;' % pad)
            else:
                op = '==' if name == 'breakc_z' else '!='
                lines.append('%sif (floatBitsToUint(%s) %s 0u) break;' % (pad, src[0], op))
        else:
            lines.append('%s// UNTRANSLATED %s %s' % (pad, name, ', '.join(src)))

    return lines


def main(path):
    lines = emit(path)
    done = sum(1 for l in lines if not l.strip().startswith('//'))
    todo = len(lines) - done
    print('%s: %d translated, %d untranslated' % (path.rsplit('/', 1)[-1], done, todo))
    print()

    for l in lines[:70]:
        print(l)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    main(sys.argv[1])
