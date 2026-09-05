#!/usr/bin/env python3
"""Did de_dust2 load as level content, and is it visible?

Asks three separate questions rather than one, because they fail independently:

  1. did the sub-level's ReferenceObjectData instantiate at all (does the editor see an object
     whose blueprint is dust2/dust2)?
  2. what AABB does the server measure for it -- which is the mesh's own bounding box, so it says
     whether the engine read our MeshSet and at what scale;
  3. what does it look like -- a cropped screenshot of the client window.

Run through .powos-e2e-run.sh so the server and client are already up.
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor              # noqa: E402

SHOT_DIR = '/tmp/dust2/shots'


def find_objects(addr):
    js = """(function(){try{
      var e=window.editor, vals=e.gameObjects.values(), hits=[], n=0;
      for(var i=0;i<vals.length;i++){var o=vals[i]; if(!o) continue; n++;
        var nm=String(o.name||'');
        if(nm.toLowerCase().indexOf('dust2')===-1) continue;
        var ged=o.gameEntitiesData||[], boxes=[];
        for(var j=0;j<ged.length;j++){var g=ged[j]; if(!g||!g.aabb) continue; var a=g.aabb;
          if(a.min&&a.max) boxes.push([+a.min.x.toFixed(2),+a.min.y.toFixed(2),+a.min.z.toFixed(2),
                                       +a.max.x.toFixed(2),+a.max.y.toFixed(2),+a.max.z.toFixed(2)]);}
        var t=o.transform&&o.transform.trans;
        hits.push({name:nm, nGed:ged.length, boxes:boxes,
                   trans:t?[+t.x.toFixed(2),+t.y.toFixed(2),+t.z.toFixed(2)]:null});}
      return JSON.stringify({total:n, hits:hits.slice(0,10)});
    }catch(err){return JSON.stringify({err:''+err});}})()"""
    return cdp_eval(addr, js)


def find_blueprint(addr):
    js = """(function(){try{
      var e=window.editor, all=e.blueprintManager.blueprints.values(), hits=[];
      for(var i=0;i<all.length;i++){var n=String(all[i].name||'');
        if(n.toLowerCase().indexOf('dust2')!==-1) hits.push(n);}
      return JSON.stringify({n:all.length, hits:hits.slice(0,10)});
    }catch(err){return JSON.stringify({err:''+err});}})()"""
    return cdp_eval(addr, js)


def teleport(addr, x, y, z):
    """Put the camera somewhere it can see the whole map. The editor's free camera is the only
    viewpoint this harness can drive."""
    js = """(function(){try{
      var t=window.editor.threeManager, c=t.camera;
      c.position.set(%f,%f,%f); c.lookAt(0,0,0); c.updateMatrixWorld(true);
      t.setPendingRender(); return JSON.stringify({ok:1});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (x, y, z)
    return cdp_eval(addr, js)


def screenshot(tag):
    """spectacle, then crop to the client window.

    ffmpeg -f x11grab is a trap on this machine: the session is Wayland, XWayland's root window
    holds no composited content, and it writes a valid, entirely black PNG.
    """
    os.makedirs(SHOT_DIR, exist_ok=True)
    full = os.path.join(SHOT_DIR, '%s_full.png' % tag)
    subprocess.run(['spectacle', '-b', '-n', '-f', '-o', full], capture_output=True, timeout=120)

    if not os.path.exists(full):
        return None, None

    crop = os.path.join(SHOT_DIR, '%s.png' % tag)
    # The client sits around x 6786..9401, y 2218..3763 on the 12544x4096 desktop.
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', full,
                    '-vf', 'crop=2615:1545:6786:2218', crop], capture_output=True, timeout=120)
    return full, (crop if os.path.exists(crop) else None)


def main():
    addr = 'localhost:8884'

    # 220s is plenty: waiting 480 changed nothing, so a slow client load is NOT why the editor
    # fails to open here.
    if not enter_game(addr, timeout=220):
        print('SETUP: never got in game')
        return 2

    print('blueprints: %s' % json.dumps(find_blueprint(addr)), flush=True)

    if not wait_for_editor(addr):
        print('SETUP: editor never came up (objects query will be blind)')

    for label, delay in (('t+5s', 5), ('t+20s', 15), ('t+45s', 25)):
        time.sleep(delay)
        print('%-6s %s' % (label, json.dumps(find_objects(addr))), flush=True)

    full, crop = screenshot('dust2')
    print('shot: full=%s crop=%s' % (full, crop), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
