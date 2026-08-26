#!/usr/bin/env python3
"""ONE vehicle, far from the origin. Is the outline misplaced with nobody to confuse it with?

Three spaced vehicles could not tell two very different bugs apart. An object at x=20 whose box
draws at x=0 is either holding the PREVIOUS vehicle's entities (attribution is wrong), or holding
its own entities captured before the engine moved them into place (attribution is fine and the AABB
is stale). With a single vehicle there is no previous vehicle, so a box at x=0 can only be the
second.
"""
import json
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor   # noqa: E402
from spawn_spaced import spawn_at                                 # noqa: E402

OFFSET = 60.0


def main():
    addr = 'localhost:8884'
    if not enter_game(addr) or not wait_for_editor(addr):
        print("SETUP: could not reach the editor")
        return 2

    spawn_at(addr, 'Vehicles/BMP2/BMP2', fresh_guid(0), OFFSET)

    js = """(function(){var e=window.editor,out=[],vals=e.gameObjects.values();
    for(var i=0;i<vals.length;i++){var o=vals[i];
     if(!o||!o.name||String(o.name).indexOf("BMP2")===-1) continue;
     var t=o.transform&&o.transform.trans?o.transform.trans:null;
     var ged=o.gameEntitiesData||[], n=0, sx=0;
     for(var j=0;j<ged.length;j++){var a=ged[j]&&ged[j].aabb;
       var tr=a&&a.transform&&a.transform.trans?a.transform.trans:null;
       if(tr){sx+=tr.x;n++;}}
     out.push({g:String(o.guid).slice(-6), objX:t?Math.round(t.x):null,
               ged:ged.length, nAabb:n,
               localBoxX:n?Math.round(sx/n):null,
               worldBoxX:(n&&t)?Math.round(t.x+sx/n):null});}
    return JSON.stringify({objs:out});})()"""

    # Sample repeatedly: if the box moves into place later, that is the whole answer.
    for label in ("t+12s", "t+30s", "t+60s"):
        time.sleep(12 if label == "t+12s" else 18 if label == "t+30s" else 30)
        print("%-6s %s" % (label, cdp_eval(addr, js)), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
