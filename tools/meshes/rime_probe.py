#!/usr/bin/env python3
"""Run one Rime command and keep what it writes.

The mesh server drives Rime for the handful of commands the editor needs. This is the same driver
with nothing decided for you: give it a command that writes a file, get the file. It exists for
working out what the game actually holds -- which is most of what building the standalone editor
has been.

    tools/meshes/rime_probe.py 'dump_partition_json levels/mp_017/terrain/mp_017_terrain' out.json
    tools/meshes/rime_probe.py --list-commands

The destination is appended to the command in quotes unless the command already names one, because
the driver waits for the FILE rather than for the REPL's prompt (see mesh_server.Rime._command).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from export_level_meshes import DEFAULT_GAME_PATH, DEFAULT_RIME  # noqa: E402
from mesh_server import Rime  # noqa: E402


def main(argv):
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return 0

    rime = Rime(os.environ.get('MESH_RIME', DEFAULT_RIME),
                os.environ.get('MESH_GAME_PATH', DEFAULT_GAME_PATH))

    if not rime.start():
        print('Rime did not mount', file=sys.stderr)
        return 1

    if argv[0] == '--list-commands':
        # No file to wait for, so ask and read the tail the drain thread collects.
        import time
        os.write(rime.master, b'help\r')
        time.sleep(3)
        print('\n'.join(rime.tail))
        return 0

    command = argv[0]
    destination = os.path.abspath(argv[1]) if len(argv) > 1 else None

    if destination is not None:
        if os.path.exists(destination):
            os.remove(destination)

        if '"' not in command:
            command = '%s "%s"' % (command, destination)

        ok = rime._command(command, destination, int(os.environ.get('PROBE_TIMEOUT', '900')))
        print('%s -> %s (%s bytes)' % ('ok' if ok else 'FAILED', destination,
                                       os.path.getsize(destination) if os.path.exists(destination)
                                       else 0))
        if not ok:
            print('--- Rime said ---', file=sys.stderr)
            print('\n'.join(rime.tail[-25:]), file=sys.stderr)
        return 0 if ok else 1

    print('nothing to wait for: give a destination file', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
