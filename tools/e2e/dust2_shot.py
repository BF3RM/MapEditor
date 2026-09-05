#!/usr/bin/env python3
"""Fly the in-game freecam to a set of viewpoints over dust2 and capture each one.

The camera is driven the way the editor's own F-focus does it (THREEManager.focus): move the
headless three.js camera, read its world matrix, and send `FocusCamera` to the ext, which glides the
REAL freecam there over a few frames. That is the only camera in the client this session can steer
-- there is no way to inject physical input into a Wayland-hosted wine window from here.

    dust2_shot.py [tag]
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import cdp_eval                                          # noqa: E402

SHOT_DIR = '/tmp/dust2/shots'
CROP = 'crop=2615:1545:6786:2218'

# (name, camera position, look-at target). dust2 is centred on the origin, floor at y=0, and spans
# +/-68 m in X and +/-66 m in Z.
VIEWS = [
    ('overhead', (0, 150, 0.1), (0, 0, 0)),
    ('oblique', (110, 70, 110), (0, 5, 0)),
    ('ground_mid', (0, 3, 55), (0, 3, -20)),
    ('close', (-20, 6, 20), (10, 2, -10)),
]


def look_at(pos, target):
    js = """(function(){try{
      var e=window.editor, t=e.threeManager, c=t.camera;
      c.position.set(%f,%f,%f); c.up.set(0,1,0); c.lookAt(%f,%f,%f); c.updateMatrixWorld(true);
      var m=c.matrixWorld.elements;
      var tr={left:{x:m[0],y:m[1],z:m[2]}, up:{x:m[4],y:m[5],z:m[6]},
              forward:{x:m[8],y:m[9],z:m[10]}, trans:{x:m[12],y:m[13],z:m[14]}};
      window.vext.SendEvent('FocusCamera', {transform:tr, duration:0.4});
      t.setPendingRender();
      return JSON.stringify({sent:1, pos:[m[12],m[13],m[14]]});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (pos + target)
    return cdp_eval('localhost:8884', js)


def capture(name):
    os.makedirs(SHOT_DIR, exist_ok=True)
    full = os.path.join(SHOT_DIR, '_%s_full.png' % name)
    subprocess.run(['spectacle', '-b', '-n', '-f', '-o', full], capture_output=True, timeout=120)

    if not os.path.exists(full):
        return None

    out = os.path.join(SHOT_DIR, '%s.png' % name)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', full, '-vf', CROP, out],
                   capture_output=True, timeout=120)
    os.remove(full)
    return out if os.path.exists(out) else None


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else ''

    for name, pos, target in VIEWS:
        print('%-10s %s' % (name, look_at(pos, target)), flush=True)
        time.sleep(6)
        print('           -> %s' % capture(tag + name), flush=True)

    return 0


if __name__ == '__main__':
    sys.exit(main())
