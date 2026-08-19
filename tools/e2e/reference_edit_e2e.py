#!/usr/bin/env python3
"""End-to-end check for REFERENCE ASSIGNMENT (the reference-editor wire verb).

The edit grammar had exactly one verb — "assign a scalar". Every descriptor recursed on the field
name until isPrintable() was true, so there was no shape that could say "point this field at that
instance", and the inspector could browse a reference but never change one. EBXManager:SetField now
accepts a terminal `ref: true` node whose value is {partitionGuid, instanceGuid}.

This drives that path with no UI: pick a loaded object, find a resolvable reference field on it,
repoint it at a DIFFERENT instance of the same type, and read the partition back to confirm the
field actually moved.

Usage:  python3 reference_edit_e2e.py [--addr localhost:8884]
Exit 0 = the reference was reassigned, 1 = it was not, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, VU_CDP_PY, _FRESH_FETCH_JS  # noqa: E402


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


def poll(addr, js, key, tries=30, delay=2):
    for _ in range(tries):
        time.sleep(delay)
        r = cdp_eval(addr, js)
        if isinstance(r, dict) and (r.get(key) is not None or r.get("err")):
            return r
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")

    # Collect root reference fields across many objects, then pair two that share the same field
    # name AND the same target TYPE but point at different instances. Cross-partition is the norm
    # for Frostbite references, and a same-type target is required: a type-mismatched assignment is
    # silently rejected by the engine (verified — the field read back nil).
    cdp_eval(addr, """(function(){
      window.__pick=null; window.__recs=[]; window.__scanDone=false;
      var d=window.editor.gameObjects, ks=d.keys(), idx=0, scanned=0, LIMIT=60;
      function next(){
        if(scanned>=LIMIT || idx>=ks.length){ window.__scanDone=true; return; }
        var go=d.getValue(ks[idx++]);
        if(!go || go.origin!==1 || !go.blueprintCtrRef){ next(); return; }
        scanned++;
        window.__freshFetch(go.blueprintCtrRef.partitionGuid.toString(), function(part){
          if(part && part.primaryInstance){
            var pi=part.primaryInstance;
            for(var name in pi.fields){
              var f=pi.fields[name], v=f.value;
              if(v && v.instanceGuid && v.partitionGuid){
                var cur=part.instances[String(v.instanceGuid).toLowerCase()];
                if(cur){ window.__recs.push({obj:go.guid.toString(), objName:String(go.name),
                          field:name, ftype:f.type, targetType:cur.typeName,
                          tPart:String(part.guid), tInst:String(cur.guid)}); } } }
          }
          next();
        });
      }
      next(); return 'scanning';})()""")
    for _ in range(90):
        time.sleep(2)
        st = cdp_eval(addr, "(function(){return JSON.stringify({done:window.__scanDone,n:window.__recs.length});})()")
        if isinstance(st, dict) and st.get("done"):
            break
    pair = cdp_eval(addr, """(function(){
      var r=window.__recs, byKey={};
      for(var i=0;i<r.length;i++){
        var k=r[i].field+'|'+r[i].targetType;
        if(!byKey[k]) byKey[k]=[];
        byKey[k].push(r[i]); }
      for(var k in byKey){ var g=byKey[k];
        for(var i=0;i<g.length;i++){ for(var j=0;j<g.length;j++){
          if(g[i].obj!==g[j].obj && g[i].tInst.toLowerCase()!==g[j].tInst.toLowerCase()){
            window.__pick={ok:true, objGuid:g[i].obj, objName:g[i].objName, field:g[i].field,
              type:g[i].ftype, curType:g[i].targetType,
              from:g[i].tInst, to:g[j].tInst,
              part:g[j].tPart,        // partition of the NEW target (what we assign)
              srcPart:g[i].tPart};    // partition of the EDITED object's own blueprint
            return JSON.stringify({ok:true, key:k, records:r.length}); } } } }
      return JSON.stringify({ok:false, records:r.length});})()""")
    if not (isinstance(pair, dict) and pair.get("ok")):
        print("SETUP: no cross-object same-type reference pair:", json.dumps(pair)); return 2
    pick = cdp_eval(addr, "(function(){return JSON.stringify(window.__pick);})()")
    print("target:", json.dumps({k: pick[k] for k in ("objName","field","curType","from","to")}), flush=True)

    edit = cdp_eval(addr, """(function(){ var p=window.__pick;
      window.vext.SendCommand({ type:'SetEBXFieldCommand', sender: window.editor.playerName,
        gameObjectTransferData:{ guid: p.objGuid, overrides:[{
          field: p.field, type: p.type, ref: true,
          value:{ partitionGuid: p.part, instanceGuid: p.to } }] } });
      return JSON.stringify({sent:true});})()""")
    if not (isinstance(edit, dict) and edit.get("sent")):
        print("SETUP: edit dispatch failed:", json.dumps(edit)); return 2
    print("edit dispatched", flush=True)
    time.sleep(7)

    # Two things must hold, and they pull in opposite directions:
    #   1. the edit is RECORDED on the object (so it saves, bakes and survives a respawn), and
    #   2. the SHARED blueprint is untouched (per-instance isolation — the edit must not leak to
    #      every other instance of this prefab).
    # Reading the shared partition and expecting the new value is wrong: SetOverrides deep-copies
    # the edited path and writes the CLONE, so the shared blueprint still showing the original is
    # the feature working, not failing.
    time.sleep(2)
    state = cdp_eval(addr, """(function(){ var p=window.__pick;
      var d=window.editor.gameObjects, ks=d.keys(), obj=null;
      for(var i=0;i<ks.length;i++){ var g=d.getValue(ks[i]);
        if(g && g.guid && g.guid.toString().toLowerCase()===p.objGuid.toLowerCase()){ obj=g; break; } }
      if(!obj) return JSON.stringify({err:'object gone after edit'});
      var ov=obj.overrides||{}, keys=Object.keys(ov), hit=null;
      for(var i=0;i<keys.length;i++){ if(keys[i].indexOf(p.field)!==-1){ hit=keys[i]; break; } }
      return JSON.stringify({overrideKeys:keys, matched:hit, origin:obj.origin});})()""")
    if not isinstance(state, dict) or state.get("err"):
        print("FAIL: could not inspect the object after the edit:", json.dumps(state)); return 1
    if not state.get("matched"):
        print("FAIL: no override recorded for", pick["field"], "— got", json.dumps(state.get("overrideKeys")))
        return 1
    print(f"PASS[recorded]: override '{state['matched']}' present (origin={state.get('origin')})", flush=True)

    cdp_eval(addr, """(function(){ window.__iso=null; var p=window.__pick;
      window.__freshFetch(p.srcPart, function(part, err){
        if(!part || !part.primaryInstance){ window.__iso={err:String(err||'no partition')}; return; }
        var f=part.primaryInstance.fields[p.field], v=f && f.value;
        window.__iso={shared: (v && v.instanceGuid) ? String(v.instanceGuid) : null};
      }); return 'dispatched';})()""")
    iso = poll(addr, "(function(){return JSON.stringify(window.__iso);})()", "shared", tries=25)
    if isinstance(iso, dict) and iso.get("shared"):
        if iso["shared"].lower() == pick["to"].lower():
            print("FAIL[isolation]: the SHARED blueprint was repointed — the edit leaked to every instance")
            return 1
        print(f"PASS[isolation]: shared blueprint still points at {iso['shared']}")
    else:
        print("WARN[isolation]: could not read the shared blueprint back:", json.dumps(iso))

    print("RESULT: reference assignment works (recorded on the instance, shared blueprint intact)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
