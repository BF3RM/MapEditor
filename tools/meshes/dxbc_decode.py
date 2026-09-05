#!/usr/bin/env python3
"""Decode a DXBC shader's instruction stream (the SHEX/SHDR chunk).

BF3's surface shaders ship as compiled DX11 bytecode inside each ShaderSolution's permutation, so
rendering a BF3 material faithfully means executing that bytecode rather than approximating what it
does. Nothing on this machine translates DXBC -- no spirv-cross, no glslang, no dxc, and DXVK is
present only as compiled DLLs -- so the decoder starts here.

This stage is deliberately just the disassembly: token stream in, opcodes and operands out. It is
checkable against the STAT chunk's own instruction count, which is the point -- a decoder that
silently mis-strides produces plausible garbage, and the count is the cheapest way to catch that.

    dxbc_decode.py <file.dxbc>
"""
import struct
import sys

# D3D10/11 opcode names, indexed by opcode id. Only the ones a surface shader realistically uses are
# named; the rest print as their number so an unknown opcode is obvious rather than silently skipped.
OPCODES = {
    # The D3D10/11 opcode enum, in order. Guessing at this mapping put CUSTOMDATA at 50
    # (it is MAD), so a mad was read as customdata, its 'length' taken from the next dword,
    # and the walk left the stream entirely -- 4 MB consumed of a 1864-byte body.
    0: 'add',
    1: 'and',
    2: 'break',
    3: 'breakc',
    4: 'call',
    5: 'callc',
    6: 'case',
    7: 'continue',
    8: 'continuec',
    9: 'cut',
    10: 'default',
    11: 'deriv_rtx',
    12: 'deriv_rty',
    13: 'discard',
    14: 'div',
    15: 'dp2',
    16: 'dp3',
    17: 'dp4',
    18: 'else',
    19: 'emit',
    20: 'emitthencut',
    21: 'endif',
    22: 'endloop',
    23: 'endswitch',
    24: 'eq',
    25: 'exp',
    26: 'frc',
    27: 'ftoi',
    28: 'ftou',
    29: 'ge',
    30: 'iadd',
    31: 'if',
    32: 'ieq',
    33: 'ige',
    34: 'ilt',
    35: 'imad',
    36: 'imax',
    37: 'imin',
    38: 'imul',
    39: 'ine',
    40: 'ineg',
    41: 'ishl',
    42: 'ishr',
    43: 'itof',
    44: 'label',
    45: 'ld',
    46: 'ld_ms',
    47: 'log',
    48: 'loop',
    49: 'lt',
    50: 'mad',
    51: 'min',
    52: 'max',
    53: 'customdata',
    54: 'mov',
    55: 'movc',
    56: 'mul',
    57: 'ne',
    58: 'nop',
    59: 'not',
    60: 'or',
    61: 'resinfo',
    62: 'ret',
    63: 'retc',
    64: 'round_ne',
    65: 'round_ni',
    66: 'round_pi',
    67: 'round_z',
    68: 'rsq',
    69: 'sample',
    70: 'sample_c',
    71: 'sample_c_lz',
    72: 'sample_l',
    73: 'sample_d',
    74: 'sample_b',
    75: 'sqrt',
    76: 'switch',
    77: 'sincos',
    78: 'udiv',
    79: 'ult',
    80: 'uge',
    81: 'umul',
    82: 'umad',
    83: 'umax',
    84: 'umin',
    85: 'ushr',
    86: 'utof',
    87: 'xor',
    88: 'dcl_resource',
    89: 'dcl_constant_buffer',
    90: 'dcl_sampler',
    91: 'dcl_index_range',
    92: 'dcl_gs_output_primitive_topology',
    93: 'dcl_gs_input_primitive',
    94: 'dcl_max_output_vertex_count',
    95: 'dcl_input',
    96: 'dcl_input_sgv',
    97: 'dcl_input_siv',
    98: 'dcl_input_ps',
    99: 'dcl_input_ps_sgv',
    100: 'dcl_input_ps_siv',
    101: 'dcl_output',
    102: 'dcl_output_sgv',
    103: 'dcl_output_siv',
    104: 'dcl_temps',
    105: 'dcl_indexable_temp',
    106: 'dcl_global_flags',
}

# Declarations are interface, not work: D3D's own instruction count excludes them.
DECLARATIONS = set(range(88, 107))


def chunks(data):
    if data[:4] != b'DXBC':
        raise ValueError('not a DXBC container')

    count = struct.unpack_from('<I', data, 28)[0]
    out = {}

    for offset in struct.unpack_from('<%dI' % count, data, 32):
        name = data[offset:offset + 4].decode('ascii', 'replace')
        size = struct.unpack_from('<I', data, offset + 4)[0]
        out[name] = data[offset + 8:offset + 8 + size]

    return out


def decode(body):
    """Walk the token stream. Each instruction's first token carries its own length in dwords,
    which is what makes the walk self-correcting -- and what makes a wrong stride detectable."""
    version = struct.unpack_from('<I', body, 0)[0]
    dwords = struct.unpack_from('<I', body, 4)[0]
    pos = 8
    end = min(len(body), dwords * 4)
    ops, work = [], 0

    while pos + 4 <= end:
        token = struct.unpack_from('<I', body, pos)[0]
        opcode = token & 0x7FF
        length = (token >> 24) & 0x7F   # bits 24..30 -- a 5-bit read walks off the stream

        # CUSTOMDATA is 53 and carries its own dword count in the following token. This was
        # hardcoded to 50 while the opcode table was being corrected, so every `mad` (which IS 50)
        # took its length from an operand and threw the walk off the end of the stream.
        if opcode == 53:
            length = struct.unpack_from('<I', body, pos + 4)[0]

        if length == 0:                        # malformed or extended-only; stop rather than spin
            break

        name = OPCODES.get(opcode, 'op%d' % opcode)
        ops.append((name, length, opcode))

        if opcode not in DECLARATIONS:
            work += 1

        pos += length * 4

    return {
        'model': '%d.%d' % ((version >> 4) & 0xF, version & 0xF),
        'type': (version >> 16) & 0xFFFF,
        'declared_dwords': dwords,
        'consumed': pos,
        'ops': ops,
        'work_instructions': work,
    }


def main(paths):
    for path in paths:
        data = open(path, 'rb').read()
        parts = chunks(data)
        body = parts.get('SHEX') or parts.get('SHDR')

        if body is None:
            print('%s: no SHEX/SHDR chunk' % path)
            continue

        info = decode(body)
        stat = parts.get('STAT')
        declared = struct.unpack_from('<I', stat, 0)[0] if stat else None

        print('=' * 74)
        print('%s  (model %s)' % (path.rsplit('/', 1)[-1], info['model']))
        print('  stream: consumed %d of %d bytes' % (info['consumed'], info['declared_dwords'] * 4))
        print('  instructions decoded: %d   STAT says: %s   %s' % (
            info['work_instructions'], declared,
            'MATCH' if declared == info['work_instructions'] else 'MISMATCH'))

        counts = {}

        for name, _, _ in info['ops']:
            counts[name] = counts.get(name, 0) + 1

        print('  opcodes: %s' % ', '.join(
            '%s x%d' % (k, v) for k, v in sorted(counts.items(), key=lambda kv: -kv[1])))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    main(sys.argv[1:])
