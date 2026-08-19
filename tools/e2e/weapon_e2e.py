#!/usr/bin/env python3
"""End-to-end check for vehicle blueprints: spawn one, then read and edit its EBX data.

Two bugs made this untestable until now, and this script is the regression guard for both:

* Spawning a VehicleBlueprint killed the CLIENT PROCESS outright — no server error, no crash
  dump. Traced to EntityCreationParams.parentRepresentative (GH #202); a bare ReferenceObjectData
  crashed it just as reliably as a fully populated one, so it was the presence of a runtime
  representative, not any field on it.
* Selecting the spawned vehicle then produced an EMPTY partition. PartitionSerializer only knew
  about partitions that Partition:Loaded had reported, and blueprint partitions are lazy/streamed
  so they never fire it — the inspector had nothing to show and the fields could not be edited.

Usage:  python3 vehicle_e2e.py [--addr localhost:8884] [--blueprint Weapons/M60/M60]
Exit 0 = all checks passed, 1 = a check failed, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, VU_CDP_PY  # noqa: E402

SPAWN_GUID = 'ED170122-8888-0000-0000-100000000011'


def wait_for_cdp(addr, timeout=600):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            p = subprocess.run(["python3", VU_CDP_PY, "--addr", addr, "targets"],
                               capture_output=True, text=True, timeout=10)
            if "main/players" in (p.stdout or "") or "mapeditor" in (p.stdout or ""):
                return True
        except Exception:
            pass
        time.sleep(5)
    return False


def client_alive(addr):
    r = cdp_eval(addr, "(function(){return JSON.stringify({ok:!!window.editor});})()")
    return isinstance(r, dict) and r.get("ok") is True


def find_object(addr, needle):
    """Look an object up by name. NOT getValue(): gameObjects is keyed by Guid OBJECTS, so
    getValue('<string>') silently returns undefined and every lookup looks like 'object missing'."""
    js = """(function(){var d=window.editor.gameObjects,ks=d.keys();
      for(var i=0;i<ks.length;i++){var g=d.getValue(ks[i]);
        if(g&&String(g.name||'').indexOf(%s)!==-1){
          window.__veh=g;
          return JSON.stringify({found:true,key:String(ks[i]),name:String(g.name),origin:g.origin,
            ents:Object.keys(g.gameEntities||{}).length,
            bpPart:String(g.blueprintCtrRef.partitionGuid),
            bpInst:String(g.blueprintCtrRef.instanceGuid)});}}
      return JSON.stringify({found:false});})()""" % json.dumps(needle)
    return cdp_eval(addr, js)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--blueprint", default="Weapons/M60/M60")
    args = ap.parse_args()
    addr, bp_name = args.addr, args.blueprint
    short = bp_name.rsplit("/", 1)[-1]
    failures = []

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)

    # --- 1. spawn -------------------------------------------------------------------------
    spawn_js = """(function(){try{
      var e=window.editor, NAME=%s;
      var all=e.blueprintManager.blueprints.values(), bp=null;
      for(var i=0;i<all.length;i++){ if(String(all[i].name)===NAME){bp=all[i];break;} }
      if(!bp) return JSON.stringify({err:'blueprint not in browser: '+NAME});
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
                   trans:{x:pos.x,y:pos.y+3,z:pos.z}},
        variation:v, isDeleted:false, isEnabled:true}});
      return JSON.stringify({sent:true,type:bp.typeName});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (json.dumps(bp_name), json.dumps(SPAWN_GUID))
    r = cdp_eval(addr, spawn_js)
    if not (isinstance(r, dict) and r.get("sent")):
        print("SETUP: spawn command rejected:", r); return 2
    print("spawn dispatched:", r, flush=True)

    obj = None
    for _ in range(30):                      # heavy blueprints take a while to register
        time.sleep(2)
        if not client_alive(addr):
            print("FAIL[spawn]: the client died — parentRepresentative regression is back")
            return 1
        obj = find_object(addr, short)
        if isinstance(obj, dict) and obj.get("found"):
            break
    if not (isinstance(obj, dict) and obj.get("found")):
        print("FAIL[spawn]: client survived but the object never registered")
        return 1
    print("PASS[spawn]: client alive, object registered:", json.dumps(obj), flush=True)

    # --- 2. partition must actually serialize ---------------------------------------------
    from mapeditor_e2e import _FRESH_FETCH_JS
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")
    cdp_eval(addr, """(function(){window.__p=null;
      window.__freshFetch(%s, function(p,err){
        window.__p = err ? {err:err} :
          {ok:true, primary:p.primaryInstance?p.primaryInstance.typeName:null,
           instances:p.instances?Object.keys(p.instances).length:0};});
      return 'dispatched';})()""" % json.dumps(obj["bpPart"]))
    part = None
    for _ in range(25):
        time.sleep(3)
        got = cdp_eval(addr, "(function(){return JSON.stringify(window.__p);})()")
        if isinstance(got, dict) and (got.get("ok") or got.get("err")):
            part = got
            break
    if not (isinstance(part, dict) and part.get("ok") and part.get("instances", 0) > 0):
        stats = cdp_eval(addr, "(function(){return JSON.stringify(window.__pstats||{none:true});})()")
        print("FAIL[partition]: blueprint partition came back empty —", json.dumps(part))
        print("   client chunk stats:", json.dumps(stats))
        failures.append("partition")
    else:
        print("PASS[partition]:", json.dumps(part), flush=True)

    print("RESULT:", "FAIL " + ",".join(failures) if failures else "all checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
