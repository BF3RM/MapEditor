#!/usr/bin/env python3
"""Does the engine actually load a MeshSet this toolchain wrote?

Spawns objects/loadingpallet_01 and reports the AABB of its spatial entities. The
UsdRoundTrip mod ships that mesh scaled 2x, having gone BF3 -> USD -> BF3, so:

    mod disabled -> stock extents
    mod enabled  -> extents twice as large

Anything else means the engine did not read our bytes. Run it both ways and diff.
"""
import json
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor   # noqa: E402
from spawn_spaced import spawn_at                                             # noqa: E402

MATCH = 'loadingpallet_01'


def find_blueprint(addr):
    js = """(function(){try{
      var e=window.editor, all=e.blueprintManager.blueprints.values(), hits=[];
      for(var i=0;i<all.length;i++){var n=String(all[i].name||'');
        if(n.toLowerCase().indexOf(%s)!==-1) hits.push({name:n,type:String(all[i].typeName)});}
      return JSON.stringify({n:all.length,hits:hits.slice(0,20)});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % json.dumps(MATCH)
    return cdp_eval(addr, js)


def report(addr, name):
    js = """(function(){var e=window.editor,out=[],vals=e.gameObjects.values(),n=0;
    for(var i=0;i<vals.length;i++){var o=vals[i]; if(!o) continue; n++;
     var nm=String(o.name||'');
     if(nm!==%s) continue;
     var ged=o.gameEntitiesData||[], boxes=[], kinds=[];
     for(var j=0;j<ged.length;j++){var g=ged[j]; if(!g) continue;
       kinds.push(String(g.typeName||g.type||'?')+(g.isSpatial?'/S':''));
       var a=g.aabb;
       if(a&&a.min&&a.max) boxes.push([+a.min.x.toFixed(3),+a.min.y.toFixed(3),+a.min.z.toFixed(3),
                                       +a.max.x.toFixed(3),+a.max.y.toFixed(3),+a.max.z.toFixed(3)]);}
     out.push({name:nm,guid:String(o.guid).slice(-6),origin:o.origin,
               nGed:ged.length,kinds:kinds.slice(0,6),boxes:boxes});}
    return JSON.stringify({total:n,pallets:out});})()""" % json.dumps(name)
    return cdp_eval(addr, js)


def select_pallets(addr, exact):
    """The server only measures an object's spatial entities when something asks
    (GameObjectManager:OnRequestBoxes). NativeViewport asks for whatever is
    selected, so selecting the vanilla pallets is what makes their AABBs real."""
    js = """(function(){try{
      var e=window.editor, vals=e.gameObjects.values(), picked=[];
      for(var i=0;i<vals.length && picked.length<4;i++){
        var o=vals[i]; if(!o||String(o.name)!==%s) continue; picked.push(o);}
      if(!picked.length) return JSON.stringify({err:'no vanilla pallets'});
      e.selectionGroup.select(picked[0], false, false);
      for(var k=1;k<picked.length;k++) e.selectionGroup.select(picked[k], true, false);
      return JSON.stringify({selected:(e.selectionGroup.selectedGameObjects||[]).length});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % json.dumps(exact)
    return cdp_eval(addr, js)


def main():
    addr = 'localhost:8884'
    if not enter_game(addr) or not wait_for_editor(addr):
        print('SETUP: could not reach the editor')
        return 2

    exact = 'Objects/LoadingPallet_01/LoadingPallet_01'
    print('select: %s' % select_pallets(addr, exact), flush=True)

    for label, delay in (('t+10s', 10), ('t+25s', 15), ('t+45s', 20), ('t+70s', 25)):
        time.sleep(delay)
        r = report(addr, exact)
        print('%-6s %s' % (label, r), flush=True)
        if isinstance(r, dict) and any(p.get('boxes') for p in r.get('pallets', [])):
            break
    return 0


if __name__ == '__main__':
    sys.exit(main())
