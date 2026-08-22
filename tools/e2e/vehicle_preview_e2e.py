#!/usr/bin/env python3
"""Does a per-instance edit to a NETWORKED blueprint show up live?

A vehicle cannot be previewed the way everything else is (respawn from a runtime clone) -- the
engine will not build a networked entity from anything a mod makes at runtime. VehiclePreview
therefore mirrors the edit onto the SHARED blueprint temporarily and refreshes.

So the assertion here is the INVERSE of the isolation check in mapeditor_e2e's apply test: while an
edit is being previewed the shared blueprint SHOULD carry the new value, and once the preview is
cleared it should go back to the baseline.

  1. spawn a vehicle
  2. read a Float32 straight off the shared blueprint  -> baseline
  3. edit that field on the instance (inspector path, no Apply)
  4. shared blueprint must now read the NEW value      -> preview is live
  5. select something else                             -> preview restores
  6. shared blueprint must read the BASELINE again     -> nothing was left behind

Step 6 matters as much as step 4: a preview that fails to restore silently modifies the level.

Usage:  python3 vehicle_preview_e2e.py [--addr localhost:8884] [--blueprint Vehicles/BMP2/BMP2]
Exit 0 = passed, 1 = a check failed, 2 = could not set up.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, _FRESH_FETCH_JS, _poll  # noqa: E402

SPAWN_GUID = 'ED170122-7777-0000-0000-100000000042'


def spawn_vehicle(addr, bp_name):
    js = """(function(){try{
      var e=window.editor, bp=null, vals=e.blueprintManager? e.blueprintManager.blueprints : null;
      var want=%s;
      if(e.blueprintManager && typeof e.blueprintManager.getBlueprintByName==='function'){
        bp=e.blueprintManager.getBlueprintByName(want);
      }
      if(!bp && vals){ for(var k in vals){ if(vals[k] && vals[k].name===want){ bp=vals[k]; break; } } }
      if(!bp) return JSON.stringify({err:'blueprint not found: '+want});
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
      return JSON.stringify({sent:true,type:bp.typeName,part:String(bp.partitionGuid)});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (json.dumps(bp_name), json.dumps(SPAWN_GUID))
    return cdp_eval(addr, js)


def read_shared_scalar(addr):
    """Read the chosen scalar off the SHARED blueprint, fresh from the server every time."""
    cdp_eval(addr, """(function(){
      window.__sv=null;
      window.__freshFetch(window.__vp.bpPart, function(part, err){
        if(!part){ window.__sv={err:err||'no part'}; return; }
        var ref=part.primaryInstance.fields.object;
        if(!ref||!ref.value){ window.__sv={err:'no object field'}; return; }
        var inst=part.instances[ref.value.instanceGuid.toString().toLowerCase()];
        if(!inst){ window.__sv={err:'object instance missing'}; return; }
        var f=inst.fields[window.__vp.scalar];
        window.__sv={value: f? f.value : null};
      });
      return 'dispatched';})()""")
    return _poll(addr, "(function(){return JSON.stringify(window.__sv);})()", "value", tries=30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--blueprint", default="Vehicles/BMP2/BMP2")
    args = ap.parse_args()

    if not enter_game(args.addr):
        print("SETUP: could not enter the game"); return 2
    if not wait_for_editor(args.addr):
        print("SETUP: editor never became ready"); return 2

    cdp_eval(args.addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")

    r = spawn_vehicle(args.addr, args.blueprint)
    if not (isinstance(r, dict) and r.get("sent")):
        print("SETUP: spawn rejected:", r); return 2
    print("spawn dispatched:", json.dumps(r), flush=True)

    short = args.blueprint.split("/")[-1]
    obj = None
    for _ in range(30):
        time.sleep(2)
        obj = cdp_eval(args.addr, """(function(){
          var e=window.editor, vals=e.gameObjects.values();
          for(var i=0;i<vals.length;i++){
            var go=vals[i];
            if(go && go.name && go.name.indexOf(%s)!==-1 && go.blueprintCtrRef){
              return JSON.stringify({found:true, key:String(go.guid), name:go.name,
                                     bpPart:String(go.blueprintCtrRef.partitionGuid)});
            }
          }
          return JSON.stringify({found:false});})()""" % json.dumps(short))
        if isinstance(obj, dict) and obj.get("found"):
            break
    if not (isinstance(obj, dict) and obj.get("found")):
        print("SETUP: the spawned vehicle never registered"); return 2
    print("object registered:", json.dumps(obj), flush=True)

    # Find an editable Float32 directly on the vehicle's `object` -- a short chain keeps this test
    # about the PREVIEW rather than about deep-path traversal.
    cdp_eval(args.addr, """(function(){
      window.__vp={bpPart:%s, key:%s}; window.__vpReady=null;
      window.__freshFetch(window.__vp.bpPart, function(part, err){
        if(!part){ window.__vpReady={err:err||'no part'}; return; }
        var ref=part.primaryInstance.fields.object;
        if(!ref||!ref.value){ window.__vpReady={err:'no object field'}; return; }
        var inst=part.instances[ref.value.instanceGuid.toString().toLowerCase()];
        if(!inst){ window.__vpReady={err:'object instance missing'}; return; }
        for(var k in inst.fields){
          var f=inst.fields[k];
          if(f && f.type==='Float32' && typeof f.value==='number'){
            window.__vp.scalar=k; window.__vp.objType=inst.typeName;
            window.__vpReady={scalar:k, value:f.value, objType:inst.typeName};
            return;
          }
        }
        window.__vpReady={err:'no Float32 on the object'};
      });
      return 'dispatched';})()""" % (json.dumps(obj["bpPart"]), json.dumps(obj["key"])))

    ready = _poll(args.addr, "(function(){return JSON.stringify(window.__vpReady);})()", "scalar", tries=40)
    if ready is None:
        got = cdp_eval(args.addr, "(function(){return JSON.stringify(window.__vpReady);})()")
        print("SETUP: could not find an editable scalar:", got); return 2

    baseline = ready["value"]
    scalar = ready["scalar"]
    new_value = round(baseline + 13.5, 3)
    print("editing %s.%s : %s -> %s" % (ready["objType"], scalar, baseline, new_value), flush=True)

    failures = []

    # --- edit the INSTANCE, no Apply -------------------------------------------------------
    edit = cdp_eval(args.addr, """(function(){
      var e=window.editor, go=e.gameObjects.getValue? null : null;
      var vals=e.gameObjects.values(), target=null;
      for(var i=0;i<vals.length;i++){ if(String(vals[i].guid)===window.__vp.key){ target=vals[i]; break; } }
      if(!target) return JSON.stringify({err:'object gone'});
      e.selectionGroup.select(target, false, false);
      var insp=document.querySelector('.inspector-component');
      var vm=insp && insp.__vue__;
      if(!vm || typeof vm.onEBXInput!=='function') return JSON.stringify({err:'inspector vm unavailable'});
      vm.selectedGameObject = target;
      vm.onEBXInput({ field:'object', type:window.__vp.objType,
                      value:{ field:window.__vp.scalar, type:'Float32',
                              value:""" + str(new_value) + """, oldValue:""" + str(baseline) + """ } }, true);
      return JSON.stringify({sent:true});})()""")
    if not (isinstance(edit, dict) and edit.get("sent")):
        print("SETUP: edit dispatch failed:", edit); return 2
    time.sleep(5)  # debounce + preview write + refresh

    # --- 1. the preview must be VISIBLE on the shared blueprint -----------------------------
    live = read_shared_scalar(args.addr)
    if live is None:
        print("FAIL[preview]: could not read the shared blueprint back")
        failures.append("preview")
    elif abs((live.get("value") or 0) - new_value) > 0.01:
        print("FAIL[preview]: shared blueprint reads %s, expected the previewed %s"
              % (live.get("value"), new_value))
        failures.append("preview")
    else:
        print("PASS[preview]: shared blueprint carries the edit (%s) — it is visible in game"
              % live.get("value"), flush=True)

    # --- 2. clearing the preview must RESTORE it -------------------------------------------
    cdp_eval(args.addr, """(function(){
      var e=window.editor;
      if(e.selectionGroup && typeof e.selectionGroup.clearSelection==='function'){
        e.selectionGroup.clearSelection();
      }
      var vals=e.gameObjects.values();
      for(var i=0;i<vals.length;i++){
        var go=vals[i];
        if(go && String(go.guid)!==window.__vp.key && go.blueprintCtrRef){
          e.selectionGroup.select(go, false, false); break;
        }
      }
      return 'ok';})()""")
    time.sleep(5)

    back = read_shared_scalar(args.addr)
    if back is None:
        print("FAIL[restore]: could not read the shared blueprint back")
        failures.append("restore")
    elif abs((back.get("value") or 0) - baseline) > 0.01:
        print("FAIL[restore]: shared blueprint left at %s, expected the baseline %s — "
              "a preview leaked into the level" % (back.get("value"), baseline))
        failures.append("restore")
    else:
        print("PASS[restore]: shared blueprint back to baseline (%s)" % back.get("value"), flush=True)

    print("RESULT:", "FAIL " + ",".join(failures) if failures else "all checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
