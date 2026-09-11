#!/usr/bin/env python3
"""Screenshot the running VU client and say, numerically, whether anything is drawn.

"Nothing renders" and "it renders" are the only questions that matter for a level export, and the
logs cannot answer either -- a client that draws sky and sun logs exactly what a client that draws
the whole level logs. This captures the screen and reports how much of it is NOT flat sky, so a
bisect step can be scored without a human looking at every frame.

    vu_shot.py                          # capture, crop to the client, print a verdict
    vu_shot.py --rect X,Y,W,H           # different window position (saved as the new default)
    vu_shot.py --full                   # keep the whole desktop instead

The client runs under Wayland through Proton, so xdotool cannot see it and there is no window id to
capture: the whole desktop is grabbed and cropped. The crop rectangle is remembered in
vu_shot.json next to the shots, because wine puts the window back where it was last time.
"""
import argparse
import json
import os
import subprocess
import sys
import time

STORE = os.path.expanduser('~/Games/VeniceUnleashed/debug/shots')
CONF = os.path.join(STORE, 'vu_shot.json')
# Device pixels, not logical: the desktop is captured at scale 2, so the 1280x720 client is 2560
# wide. Includes the title bar, which is how you can tell a capture actually found the window.
DEFAULT_RECT = (6780, 2180, 2600, 1640)


def capture(out):
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    env = dict(os.environ,
               XDG_RUNTIME_DIR='/run/user/1000', WAYLAND_DISPLAY='wayland-0', DISPLAY=':0',
               DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/1000/bus')
    subprocess.run(['spectacle', '-b', '-n', '-f', '-o', out], env=env,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)

    for _ in range(20):
        if os.path.exists(out) and os.path.getsize(out) > 0:
            return True

        time.sleep(0.5)

    return False


def rect(args):
    if args.rect:
        r = tuple(int(v) for v in args.rect.split(','))
        json.dump({'rect': r}, open(CONF, 'w'))
        return r

    if os.path.exists(CONF):
        try:
            return tuple(json.load(open(CONF))['rect'])
        except Exception:                                    # noqa: BLE001
            pass

    return DEFAULT_RECT


def analyse(path):
    try:
        from PIL import Image
    except ImportError:
        return None

    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.resize((w // 4, h // 4)).load()
    sw, sh = w // 4, h // 4
    counts = {}

    for y in range(sh):
        for x in range(sw):
            # Quantise hard: sky and sun are a handful of smooth colours, geometry is not.
            c = tuple(v >> 4 for v in px[x, y])
            counts[c] = counts.get(c, 0) + 1

    total = sw * sh
    top = sorted(counts.values(), reverse=True)
    return {'size': (w, h), 'distinct': len(counts),
            'top_share': top[0] / total if top else 0,
            'top3_share': sum(top[:3]) / total if top else 0}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(STORE, 'shot.png'))
    ap.add_argument('--rect', help='X,Y,W,H in device pixels; remembered for next time')
    ap.add_argument('--full', action='store_true', help='keep the whole desktop')
    a = ap.parse_args()

    if not capture(a.out):
        sys.exit('capture failed (is a client on screen?)')

    if not a.full:
        try:
            from PIL import Image
            x, y, w, h = rect(a)
            Image.open(a.out).crop((x, y, x + w, y + h)).save(a.out)
        except ImportError:
            pass

    st = analyse(a.out)
    print('shot %s (%d bytes)' % (a.out, os.path.getsize(a.out)))

    if not st:
        print('  (install Pillow for the verdict)')
        return

    print('  %dx%d  distinct colours %d  largest %.0f%%  top3 %.0f%%'
          % (st['size'][0], st['size'][1], st['distinct'],
             100 * st['top_share'], 100 * st['top3_share']))
    # An empty level is a gradient: very few colours, one of them almost everything.
    print('  verdict: %s' % ('GEOMETRY DRAWN' if st['distinct'] > 250 and st['top_share'] < 0.55
                             else 'LOOKS EMPTY (sky only)'))


if __name__ == '__main__':
    main()
