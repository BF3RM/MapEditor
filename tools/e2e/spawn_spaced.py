#!/usr/bin/env python3
"""Spawn N vehicles at DISTINCT positions and report which object's AABBs sit where.

The stacked-spawn version of this test could not see the reported bug at all: it put every vehicle
at the freecam position, so "the outline is on the wrong vehicle" and "the outline is on the right
vehicle" look identical. Spacing them out makes the mis-association measurable -- each object's
AABB data should sit at ITS OWN position, not a neighbour's.
"""
import json
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor   # noqa: E402

SPACING = 20.0


def spawn_at(addr, bp_name, guid, dx):
    js = """(function(){try{
      var e=window.editor, NAME=%s, bp=null;
      var all=e.blueprintManager.blueprints.values();
      for(var i=0;i<all.length;i++){ if(String(all[i].name)===NAME){bp=all[i];break;} }
      if(!bp) return JSON.stringify({err:'blueprint not in browser'});
      var v=(typeof bp.getDefaultVariation==='function')?bp.getDefaultVariation():0;
      var pos=(e.freeCam&&e.freeCam.transform&&e.freeCam.transform.trans)?
              e.freeCam.transform.trans:{x:0,y:80,z:0};
      window.vext.SendCommand({type:'SpawnGameObjectCommand', sender:'', gameObjectTransferData:{
        guid:%s, name:bp.name,
        blueprintCtrRef:{typeName:bp.typeName,name:bp.name,
                         partitionGuid:String(bp.partitionGuid),instanceGuid:String(bp.instanceGuid)},
        parentData:{guid:'00000000-0000-0000-0000-000000000000',typeName:'custom_root',
                    primaryInstanceGuid:'00000000-0000-0000-0000-000000000000',
                    partitionGuid:'00000000-0000-0000-0000-000000000000'},
        transform:{left:{x:1,y:0,z:0},up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1},
                   trans:{x:pos.x+%f,y:pos.y+3,z:pos.z}},
        variation:v, isDeleted:false, isEnabled:true}});
      return JSON.stringify({sent:true});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (
        json.dumps(bp_name), json.dumps(guid), dx)
    return cdp_eval(addr, js)


def report(addr):
    js = """(function(){var e=window.editor,out=[],vals=e.gameObjects.values();
    for(var i=0;i<vals.length;i++){var o=vals[i];
     if(!o||!o.name||String(o.name).indexOf("BMP2")===-1) continue;
     var t=o.transform&&o.transform.trans?o.transform.trans:null;
     var ged=o.gameEntitiesData||[], n=0, sx=0;
     for(var j=0;j<ged.length;j++){var a=ged[j]&&ged[j].aabb;
       var tr=a&&a.transform&&a.transform.trans?a.transform.trans:null;
       if(tr){sx+=tr.x;n++;}}
     out.push({g:String(o.guid).slice(-6), x:t?Math.round(t.x):null,
               ged:ged.length, nAabb:n, meanAabbX:n?Math.round(sx/n):null});}
    return JSON.stringify({objs:out});})()"""
    return cdp_eval(addr, js)


def main():
    addr = 'localhost:8884'
    if not enter_game(addr) or not wait_for_editor(addr):
        print("SETUP: could not reach the editor")
        return 2

    for i in range(3):
        spawn_at(addr, 'Vehicles/BMP2/BMP2',
                 'ED170122-7777-0000-0000-5ACED000%04d' % i, i * SPACING)
        time.sleep(10)

    print(json.dumps(report(addr)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
