#!/usr/bin/env python3
"""Spawn the SAME vehicle blueprint twice, with NO edits. Does the second one kill the client?

Reported: "I spawned a BMP, changed gravity (fine), then spawned a 2nd BMP and crashed." The same
symptom was reported at the very start of this work, before VehiclePreview existed -- so the point
of this script is to decide which it is:

  * crashes with no edits at all  -> pre-existing spawn bug, nothing to do with previews
  * survives with no edits        -> the preview (or its shared write) is implicated

It deliberately does NOT edit anything. Run vehicle_preview_e2e.py for the edit path.

Usage:  python3 spawn_twice_e2e.py [--addr localhost:8884] [--blueprint Vehicles/BMP2/BMP2]
Exit 0 = both spawns survived, 1 = the client died, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor  # noqa: E402

GUIDS = ['ED170122-7777-0000-0000-1000000000A1',
         'ED170122-7777-0000-0000-1000000000A2']


def server_alive():
    """Is the dedicated server still up?

    window.editor disappearing does NOT mean the client died -- it also goes when the client merely
    loses its server. Reporting "the client crashed" for a server crash sends you looking in the
    wrong realm, which it already did once.
    """
    out = subprocess.run(["pgrep", "-f", "serverInstancePath.*-server"],
                         capture_output=True, text=True).stdout.split()
    for pid in out:
        try:
            comm = open("/proc/%s/comm" % pid).read().strip()
        except OSError:
            continue
        if comm not in ("bash", "sh", "dash", "zsh"):
            return True
    return False


def client_alive(addr):
    r = cdp_eval(addr, "(function(){return JSON.stringify({ok: !!(window.editor)});})()", timeout=15)
    return isinstance(r, dict) and r.get("ok") is True


def spawn(addr, bp_name, guid):
    js = """(function(){try{
      var e=window.editor, NAME=%s, bp=null;
      var all=e.blueprintManager.blueprints.values();
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
      return JSON.stringify({sent:true});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % (json.dumps(bp_name), json.dumps(guid))
    return cdp_eval(addr, js)


def count_objects(addr, short):
    r = cdp_eval(addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values(), n=0;
      for(var i=0;i<vals.length;i++){
        if(vals[i] && vals[i].name && vals[i].name.indexOf(%s)!==-1) n++;
      }
      return JSON.stringify({n:n});})()""" % json.dumps(short))
    return r.get("n") if isinstance(r, dict) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--blueprint", default="Vehicles/BMP2/BMP2")
    ap.add_argument("--raw-write", action="store_true",
                    help="between the spawns, write the shared blueprint DIRECTLY via the "
                         "RawWriteProbe NetEvent -- no GameObject, no clone, no overrides")
    ap.add_argument("--edit-gravity", action="store_true",
                    help="edit vehicleConfig.gravityModifier (a RUNTIME-read field) rather than "
                         "whatever Float32 happens to be first on the object")
    ap.add_argument("--edit", action="store_true",
                    help="edit a scalar on the first vehicle before spawning the second -- "
                         "this is the exact reported sequence")
    args = ap.parse_args()
    short = args.blueprint.rsplit("/", 1)[-1]

    if not enter_game(args.addr):
        print("SETUP: could not enter the game"); return 2
    if not wait_for_editor(args.addr):
        print("SETUP: editor never became ready"); return 2

    for index, guid in enumerate(GUIDS, start=1):
        r = spawn(args.addr, args.blueprint, guid)
        if not (isinstance(r, dict) and r.get("sent")):
            print("SETUP: spawn %d rejected: %s" % (index, r)); return 2
        print("spawn %d dispatched" % index, flush=True)

        # Give it time to build, then check the client is still there.
        for _ in range(15):
            time.sleep(2)
            if not client_alive(args.addr):
                print("FAIL: the client DIED on spawn %d (no edits were made)" % index)
                print("      -> pre-existing spawn bug, not the preview" if index > 1 else
                      "      -> even the FIRST spawn kills it")
                return 1
            n = count_objects(args.addr, short)
            if n is not None and n >= index:
                break

        registered = count_objects(args.addr, short)

        if not registered or registered < index:
            print("SETUP: spawn %d never registered (%s objects) -- the editor is not spawning, so "
                  "this run proves nothing. Check the server log for load errors." % (index, registered))
            return 2

        print("  spawn %d ok, %d objects registered, %s alive"
              % (index, registered, "client" if client_alive(args.addr) else "?"), flush=True)

        # Bisect: modify the blueprint with NONE of the editor's machinery involved.
        if args.raw_write and index == 1:
            r = cdp_eval(args.addr, """(function(){
              window.vext.SendEvent('RawWrite', %s); return JSON.stringify({sent:true});})()"""
              % json.dumps(args.blueprint))
            print("  raw write dispatched:", r, flush=True)
            time.sleep(5)
            if not client_alive(args.addr):
                print("FAIL: %s died on the RAW WRITE itself"
                      % ("the CLIENT" if server_alive() else "the SERVER")); return 1

        # Edit the field users actually care about: gravityModifier, which lives at
        #   object -> components[1] -> vehicleConfig -> gravityModifier
        # onEBXInput prepends 'object' itself, and array elements are addressed by their 1-BASED
        # name as a string.
        if args.edit_gravity and index == 1:
            r = cdp_eval(args.addr, """(function(){
              var e=window.editor, vals=e.gameObjects.values(), target=null;
              for(var i=0;i<vals.length;i++){ if(String(vals[i].guid)===%s){ target=vals[i]; break; } }
              if(!target) return JSON.stringify({err:'object gone'});
              e.selectionGroup.select(target, false, false);
              var vm=document.querySelector('.inspector-component').__vue__;
              if(!vm) return JSON.stringify({err:'no inspector'});
              vm.selectedGameObject = target;
              vm.onEBXInput({ field:'components', type:'Array', value:{
                                field:'1', type:'VehicleComponentData', value:{
                                  field:'vehicleConfig', type:'ChassisConfigData', value:{
                                    field:'gravityModifier', type:'Float32',
                                    value:-4.0, oldValue:1.6 }}}}, false);
              return JSON.stringify({sent:true});})()""" % json.dumps(guid))
            print("  gravity edit dispatched:", r, flush=True)
            time.sleep(6)
            if not client_alive(args.addr):
                print("FAIL: %s died on the GRAVITY EDIT itself"
                      % ("the CLIENT" if server_alive() else "the SERVER")); return 1

        # The reported sequence edits between the two spawns.
        if args.edit and index == 1:
            from mapeditor_e2e import _FRESH_FETCH_JS, _poll
            cdp_eval(args.addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")
            obj = cdp_eval(args.addr, """(function(){
              var e=window.editor, vals=e.gameObjects.values();
              for(var i=0;i<vals.length;i++){
                var go=vals[i];
                if(go && String(go.guid)===%s && go.blueprintCtrRef){
                  return JSON.stringify({found:true, key:String(go.guid),
                                         bpPart:String(go.blueprintCtrRef.partitionGuid)});
                }
              }
              return JSON.stringify({found:false});})()""" % json.dumps(guid))
            if not (isinstance(obj, dict) and obj.get("found")):
                print("SETUP: could not find the spawned object to edit"); return 2

            cdp_eval(args.addr, """(function(){
              window.__vp={bpPart:%s, key:%s}; window.__vpReady=null;
              window.__freshFetch(window.__vp.bpPart, function(part, err){
                if(!part){ window.__vpReady={err:err||'no part'}; return; }
                var ref=part.primaryInstance.fields.object;
                var inst=ref&&ref.value? part.instances[ref.value.instanceGuid.toString().toLowerCase()]:null;
                if(!inst){ window.__vpReady={err:'no object instance'}; return; }
                for(var k in inst.fields){
                  var f=inst.fields[k];
                  if(f && f.type==='Float32' && typeof f.value==='number'){
                    window.__vp.scalar=k; window.__vpReady={scalar:k, value:f.value}; return;
                  }
                }
                window.__vpReady={err:'no Float32'};});
              return 'dispatched';})()""" % (json.dumps(obj["bpPart"]), json.dumps(obj["key"])))
            ready = _poll(args.addr, "(function(){return JSON.stringify(window.__vpReady);})()",
                          "scalar", tries=40)
            if ready is None:
                print("SETUP: no editable scalar found"); return 2

            base, newv = ready["value"], round(ready["value"] + 21.5, 3)
            cdp_eval(args.addr, """(function(){
              var e=window.editor, vals=e.gameObjects.values(), target=null;
              for(var i=0;i<vals.length;i++){ if(String(vals[i].guid)===window.__vp.key){ target=vals[i]; break; } }
              if(!target) return JSON.stringify({err:'gone'});
              e.selectionGroup.select(target, false, false);
              var vm=document.querySelector('.inspector-component').__vue__;
              vm.selectedGameObject = target;
              vm.onEBXInput({ field:window.__vp.scalar, type:'Float32',
                              value:""" + str(newv) + """, oldValue:""" + str(base) + """ }, false);
              return JSON.stringify({sent:true});})()""")
            print("  edited %s: %s -> %s (preview now live)" % (ready["scalar"], base, newv), flush=True)
            time.sleep(5)

            if not client_alive(args.addr):
                print("FAIL: %s died on the EDIT itself"
                      % ("the CLIENT" if server_alive() else "the SERVER")); return 1

    print("RESULT: both spawns survived with no edits — the preview is implicated, not plain spawning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
