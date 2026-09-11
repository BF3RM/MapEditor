#!/usr/bin/env python3
"""Top up a durable EBX dump with named partitions, via Rime.

The emitter keeps a shipped partition's own guid by looking its NAME up in a dump of the game's
EBX. A name that is not in the dump gets a freshly invented guid instead, so a game blueprint that
places that mesh resolves to nothing -- and the mesh variation database, which is keyed on the mesh
partition guid, silently falls back to a synthesised entry. That failure is invisible in the build
and only shows up as geometry that does not draw, so the dump has to be complete, and complete for
the level being exported rather than for whichever level was exported last.

    ebx_dump.py need  <emit-dir> --dirs /tmp/closure,...   # names the emit uses but the dumps lack
    ebx_dump.py fetch <names.txt>                          # dump those names into the store

The store is ~/Games/VeniceUnleashed/debug/ebx, files named by partition guid, which is the layout
level_to_bf3.emit's USD_GUID_DIRS expects.
"""
import argparse
import glob
import json
import os
import subprocess
import sys

STORE = os.path.expanduser('~/Games/VeniceUnleashed/debug/ebx')
RIME = os.path.expanduser('~/Projects/Rime/bin/Release')
GAME = '/home/powos/.local/share/Steam/steamapps/common/Battlefield 3'


def _names_in(dirs):
    have = set()

    for base in dirs:
        if not os.path.isdir(base):
            continue

        for f in glob.glob(os.path.join(base, '**', '*.json'), recursive=True):
            try:
                d = json.load(open(f))
            except Exception:                                # noqa: BLE001
                continue

            n = (d.get('Name') or '').lower()

            if n:
                have.add(n)

    return have


def cmd_need(args):
    have = _names_in(args.dirs.split(',') + [STORE])
    want = []

    for f in glob.glob(os.path.join(args.emit, 'partitions', '*.json')):
        try:
            d = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        n = (d.get('Name') or '').lower()

        if n and n not in have:
            want.append(n)

    want = sorted(set(want))
    out = args.out or '/dev/stdout'
    open(out, 'w').write('\n'.join(want) + ('\n' if want else ''))
    print('%d name(s) the emit uses that no dump covers -> %s' % (len(want), out),
          file=sys.stderr)


def cmd_fetch(args):
    names = [l.strip() for l in open(args.names) if l.strip()]
    os.makedirs(STORE, exist_ok=True)
    # Dump by NAME to a temp file, then rename to the partition's own guid: the store is read by
    # name out of the json, but guid filenames keep repeated runs from colliding on case.
    tmp = os.path.join(STORE, '_fetch')
    os.makedirs(tmp, exist_ok=True)
    lines = ['mount_game "%s" Frostbite2_0 true' % GAME, 'select_game 1']

    for i, n in enumerate(names):
        lines.append('dump_partition_json %s "%s/%d.json"' % (n, tmp, i))

    script = os.path.join(tmp, 'fetch.cmds')
    open(script, 'w').write('\n'.join(lines) + '\n')
    env = dict(os.environ, DOTNET_ROOT=os.path.expanduser('~/.dotnet'))
    subprocess.run(['./RimeREPL', script], cwd=RIME, env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=args.timeout)
    got = 0

    for f in glob.glob(os.path.join(tmp, '*.json')):
        try:
            d = json.load(open(f))
        except Exception:                                    # noqa: BLE001
            continue

        pg = d.get('PartitionGuid')

        if not pg:
            continue

        os.replace(f, os.path.join(STORE, pg.lower() + '.json'))
        got += 1

    print('dumped %d of %d name(s) into %s' % (got, len(names), STORE))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    n = sub.add_parser('need')
    n.add_argument('emit')
    n.add_argument('--dirs', default='')
    n.add_argument('--out')
    n.set_defaults(fn=cmd_need)

    f = sub.add_parser('fetch')
    f.add_argument('names')
    f.add_argument('--timeout', type=int, default=3600)
    f.set_defaults(fn=cmd_fetch)

    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
