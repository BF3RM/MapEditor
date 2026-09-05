#!/usr/bin/env python3
"""What a compiled DX11 shader declares: its constants, by name, and what it binds where.

DXBC is self-describing. Its RDEF chunk names every constant buffer, every variable inside one,
that variable's byte offset and size, and every texture and sampler the shader binds along with the
register it binds to. ISGN/OSGN name the inputs and outputs.

That is exactly the half of the terrain problem that is not in EBX and not in the shaderdb: the
shaderdb says WHICH texture sits in register 4, and this says what the shader calls the constants it
scales and blends them with -- so a per-layer UV scale stops being a number guessed in the client
and becomes a named constant read from the game.

    dxbc_reflect.py <file.dxbc> [...]
"""
import struct
import sys


def _cstr(data, offset):
    end = data.index(b'\0', offset)
    return data[offset:end].decode('ascii', 'replace')


def chunks(data):
    """fourcc -> chunk body, for every chunk in the container."""
    if data[:4] != b'DXBC':
        raise ValueError('not a DXBC container')

    count = struct.unpack_from('<I', data, 28)[0]
    offsets = struct.unpack_from('<%dI' % count, data, 32)
    out = {}

    for offset in offsets:
        fourcc = data[offset:offset + 4].decode('ascii', 'replace')
        size = struct.unpack_from('<I', data, offset + 4)[0]
        out[fourcc] = data[offset + 8:offset + 8 + size]

    return out


def rdef(body):
    """Constant buffers (with their variables) and resource bindings."""
    (cb_count, cb_offset, bind_count, bind_offset,
     minor, major, shader_type, flags, creator) = struct.unpack_from('<IIIIBBHII', body, 0)

    # SM5 variables carry five extra fields; SM4 stops after the default value.
    wide = major >= 5
    buffers = []

    for i in range(cb_count):
        name_off, var_count, var_off, size, cb_flags, cb_type = struct.unpack_from(
            '<IIIIII', body, cb_offset + i * 24)
        variables = []

        for v in range(var_count):
            stride = 40 if wide else 24
            name, start, var_size, var_flags, type_off, default = struct.unpack_from(
                '<IIIIII', body, var_off + v * stride)
            variables.append({
                'name': _cstr(body, name),
                'offset': start,
                'size': var_size,
            })

        buffers.append({
            'name': _cstr(body, name_off),
            'size': size,
            'variables': variables,
        })

    KIND = {0: 'cbuffer', 1: 'tbuffer', 2: 'texture', 3: 'sampler',
            4: 'uav', 5: 'structured', 6: 'byteaddress'}
    bindings = []

    for i in range(bind_count):
        name_off, kind, ret, dim, samples, point, count, bind_flags = struct.unpack_from(
            '<IIIIIIII', body, bind_offset + i * 32)
        bindings.append({
            'name': _cstr(body, name_off),
            'kind': KIND.get(kind, str(kind)),
            'register': point,
            'count': count,
        })

    return {'model': '%d.%d' % (major, minor), 'buffers': buffers, 'bindings': bindings}


def signature(body):
    count = struct.unpack_from('<I', body, 0)[0]
    out = []

    for i in range(count):
        name_off, index, sys_value, comp_type, register, mask, rw, _ = struct.unpack_from(
            '<IIIIIBBH', body, 8 + i * 24)
        out.append('%s%d (reg %d)' % (_cstr(body, name_off), index, register))

    return out


def main(paths):
    for path in paths:
        data = open(path, 'rb').read()
        print('=' * 78)
        print(path.rsplit('/', 1)[-1], '(%d bytes)' % len(data))

        try:
            parts = chunks(data)
        except ValueError as e:
            print('  %s' % e)
            continue

        print('  chunks:', ' '.join(sorted(parts)))

        if 'ISGN' in parts:
            print('  inputs :', ', '.join(signature(parts['ISGN'])))

        if 'OSGN' in parts:
            print('  outputs:', ', '.join(signature(parts['OSGN'])))

        for name in ('RDEF',):
            if name not in parts:
                continue

            info = rdef(parts[name])
            print('  shader model', info['model'])

            for binding in info['bindings']:
                print('    bind %-9s %-34s register %d' % (
                    binding['kind'], binding['name'], binding['register']))

            for buffer in info['buffers']:
                print('    cbuffer %s (%d bytes)' % (buffer['name'], buffer['size']))

                for variable in buffer['variables']:
                    print('      +%-5d %-46s %d bytes' % (
                        variable['offset'], variable['name'], variable['size']))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    main(sys.argv[1:])
