#!/usr/bin/env python3
"""One command that says why the last run failed, and in which engine subsystem.

The failures in this pipeline all look identical from outside -- a server that never logs
Level:Loaded, or a client that exits with no message -- and the evidence is scattered across four
places: the server log, the client log, wine's +seh output, and the minidumps VU writes for BOTH
processes. Checking them in the wrong order costs hours; the minidump names the subsystem
immediately, because vu_image can resolve each frame to a function and the strings it references.

    vu_diag.py              # triage the most recent run
    vu_diag.py --since 30   # only evidence from the last 30 minutes

Reports, in order: how far the server and client got, then the newest crash with every frame
annotated. A frame's strings are what identify it -- 'vegetationMeshInstance' and
'vegetation/skinTransforms' is a vegetation system that has no instance to write to, which is a
missing WindComponentData, which is a visual environment the level never carried.
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
PFX = os.path.expanduser('~/.local/share/Steam/steamapps/compatdata/1238820/pfx/drive_c/users/'
                         'steamuser/AppData/Local/VeniceUnleashed')
SERVER_LOGS = [os.path.expanduser('~/Games/VeniceUnleashed/iso-instance/logs/server.log'),
               os.path.expanduser('~/Games/VeniceUnleashed/instance/logs/server.log')]
ANSI = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]')


def clean(path, limit=4_000_000):
    try:
        with open(path, 'rb') as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - limit))
            return ANSI.sub('', f.read().decode('utf-8', 'replace').replace('\0', ''))
    except OSError:
        return ''


def stage(text):
    """The last loading stage a log reached, which is how far it actually got."""
    hits = re.findall(r'LoadingInfo: ([A-Za-z ]+)', text)

    return hits[-1].strip() if hits else None


def report_logs(since):
    for path in SERVER_LOGS:
        if not os.path.exists(path):
            continue

        age = (time.time() - os.path.getmtime(path)) / 60

        if age > since:
            continue

        text = clean(path)
        ents = re.findall(r'ENTITY static=(\d+)', text)
        print('server  %s  last stage: %s%s'
              % (os.path.basename(path), stage(text) or '(none)',
                 '  entities: %s' % ents[-1] if ents else ''))
        print('        Level:Loaded: %s' % ('yes' if 'Level:Loaded' in text else 'NO'))

    logs = sorted(glob.glob(os.path.join(PFX, 'vu_*.log')), key=os.path.getmtime, reverse=True)

    if logs and (time.time() - os.path.getmtime(logs[0])) / 60 <= since:
        text = clean(logs[0])
        print('client  %s  last stage: %s' % (os.path.basename(logs[0]), stage(text) or '(none)'))
        print('        Level:Loaded: %s' % ('yes' if 'Level:Loaded' in text else 'NO'))


def annotate(dump):
    """Run the minidump through vu_image so every frame gets a function and its strings."""
    out = subprocess.run([sys.executable, os.path.join(TOOLS, 'vu_minidump.py'), dump],
                         capture_output=True, text=True).stdout
    print(out.rstrip())
    # vu_image's trace reader wants wine's "vu.com (+0xN)" shape.
    tmp = '/tmp/.vu_diag_frames.txt'
    open(tmp, 'w').write(re.sub(r'vu\.com\+(0x[0-9A-Fa-f]+)', r'vu.com (+\1)', out))
    print('\n  frames, by function and the strings it references:')
    print(subprocess.run([sys.executable, os.path.join(TOOLS, 'vu_image.py'), 'trace', tmp],
                         capture_output=True, text=True).stdout.rstrip())


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--since', type=float, default=60, help='minutes of evidence to consider')
    ap.add_argument('--seh', default='/tmp/cli_seh.log')
    a = ap.parse_args()

    print('== how far each side got')
    report_logs(a.since)

    seh = clean(a.seh) if os.path.exists(a.seh) else ''
    fault = re.findall(r'(Unhandled exception: .*)', seh)

    if fault:
        print('\n== wine caught a client fault')
        print('  ' + fault[-1])

    dumps = sorted(glob.glob(os.path.join(PFX, 'dumps', '*.dmp')), key=os.path.getmtime,
                   reverse=True)
    dumps = [d for d in dumps if (time.time() - os.path.getmtime(d)) / 60 <= a.since]

    if not dumps:
        print('\n== no minidump in the last %g minutes' % a.since)
        print('   A clean exit with no dump is usually a WEDGE, not a crash: read the last stage')
        print('   above. VU writes dumps for the SERVER too -- they land in the same directory.')

        return

    print('\n== newest crash (%d dump(s) in window)' % len(dumps))
    annotate(dumps[0])


if __name__ == '__main__':
    main()
