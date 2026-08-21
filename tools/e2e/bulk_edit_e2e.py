#!/usr/bin/env python3
"""Edit many instances of the same prefab and assert EVERY edit landed.

Guards GH #28: a bulk pass over 69 WallLamps recorded only 12 overrides — 57 edits vanished with
no error anywhere. Silent loss is worse than a crash, because the save then bakes a level that
does not match what the editor showed.

The assertion is per-object, not aggregate: it reports exactly which guids are missing their
override rather than a count, so a partial failure names its victims.

Usage:  python3 bulk_edit_e2e.py [--addr localhost:8884] [--count 40]
Exit 0 = every edit recorded, 1 = some were lost, 2 = could not set up.
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


def poll(addr, js, key, tries=40, delay=2):
    for _ in range(tries):
        time.sleep(delay)
        r = cdp_eval(addr, js)
        if isinstance(r, dict) and (r.get(key) is not None or r.get("err")):
            return r
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--count", type=int, default=40)
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")

    # Reuse the discovery the existing suite already proves works: walk light/lamp prefabs until
    # one exposes a Float32 scalar under objects[]. Not every prefab has an objects[] array — many
    # are ObjectBlueprint-shaped with a singular `object` reference — so picking only the largest
    # group finds an uneditable one and proves nothing.
    cdp_eval(addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values(), byBp={};
      for(var i=0;i<vals.length;i++){
        var go=vals[i]; if(!go||!go.blueprintCtrRef) continue;
        if(go.overrides && Object.keys(go.overrides).length) continue;
        // Skip vehicle prefabs. Measured on RealityMod's MP_007 with everything else held
        // equal: one override on Vehicles/Common/LogicalPrefabs/ArmorSwitcher kills the
        // client in ~1s, while the same override on Prefab_SmallFireWithDamage survives.
        // An override triggers a respawn and the vehicle spawn path is the fragile one, so
        // a test that picks a vehicle is measuring that bug instead of what it came to test.
        if(/vehicle/i.test(go.name||'')) continue;
        var k=go.blueprintCtrRef.instanceGuid.toString();
        (byBp[k]=byBp[k]||[]).push(go); }
      var cands=[];
      for(var k in byBp){ if(byBp[k].length>=2){
        cands.push({list:byBp[k], bpPart:byBp[k][0].blueprintCtrRef.partitionGuid.toString(),
                    name:byBp[k][0].name}); } }
      cands.sort(function(a,b){ return b.list.length-a.list.length; });
      window.__cands=cands;
      return JSON.stringify({groups:cands.length});})()""")

    cdp_eval(addr, """(function(){
      var SC=['radius','intensity','attenuationOffset','width','translucencyScale'];
      window.__sc=null;
      var tryNext=function(i){
        if(i>=window.__cands.length){ window.__sc={err:'no candidate exposed a Float32 scalar'}; return; }
        var c=window.__cands[i];
        window.__freshFetch(c.bpPart, function(part){
          if(!part||!part.primaryInstance||!part.primaryInstance.fields.objects){ tryNext(i+1); return; }
          var arr=part.primaryInstance.fields.objects.value;
          for(var j=0;j<arr.length;j++){
            var ref=arr[j].value;
            var inst=ref&&ref.instanceGuid?part.instances[ref.instanceGuid.toString().toLowerCase()]:null;
            if(!inst) continue;
            for(var s=0;s<SC.length;s++){ var f=inst.fields[SC[s]];
              if(f && f.type==='Float32' && typeof f.value==='number'){
                window.__list=c.list;
                window.__sc={ok:true, elem:arr[j].name, scalar:SC[s], base:f.value,
                            name:c.name, count:c.list.length};
                return; } } }
          tryNext(i+1);
        });
      };
      tryNext(0); return 'dispatched';})()""")
    sc = poll(addr, "(function(){return JSON.stringify(window.__sc);})()", "ok", tries=60)
    if not (isinstance(sc, dict) and sc.get("ok")):
        print("SETUP: could not find an editable prefab:", json.dumps(sc)); return 2
    grp = {"count": sc["count"], "name": sc["name"]}
    print(f"group: {sc['name']} x{sc['count']}", flush=True)
    print(f"editing {sc['elem']}.{sc['scalar']} (base {sc['base']})", flush=True)

    n = min(args.count, grp["count"])
    # One distinct value per object, through the real inspector path.
    cdp_eval(addr, """(function(){
      var e=window.editor, sc=window.__sc, list=window.__list, N=%d;
      var insp=document.querySelector('.inspector-component'); var vm=insp&&insp.__vue__;
      if(!vm||typeof vm.onEBXInput!=='function'){ window.__edited={err:'no inspector vm'}; return 'x'; }
      window.__targets=[];
      for(var i=0;i<N;i++){
        var go=list[i];
        window.__targets.push(String(go.guid));
        e.selectionGroup.select(go,false,false);
        vm.selectedGameObject = go;
        vm.onEBXInput({ field: sc.elem, type:'GameObjectData',
          value:{ field: sc.scalar, type:'Float32', value: sc.base + 5 + i, oldValue: sc.base } }, true);
      }
      window.__edited={ok:true, n:window.__targets.length};
      return 'ok';})()""" % n)
    ed = cdp_eval(addr, "(function(){return JSON.stringify(window.__edited);})()")
    if not (isinstance(ed, dict) and ed.get("ok")):
        print("SETUP: edit dispatch failed:", json.dumps(ed)); return 2
    print(f"dispatched {ed['n']} edits; waiting for respawns to settle…", flush=True)
    time.sleep(25)

    res = cdp_eval(addr, """(function(){
      var d=window.editor.gameObjects, sc=window.__sc, miss=[], ok=0;
      var want=sc.elem+'.'+sc.scalar;
      for(var i=0;i<window.__targets.length;i++){
        var guid=window.__targets[i], found=null, ks=d.keys();
        for(var j=0;j<ks.length;j++){ var g=d.getValue(ks[j]);
          if(g && String(g.guid)===guid){ found=g; break; } }
        if(!found){ miss.push({guid:guid, why:'object gone'}); continue; }
        var ov=found.overrides||{}, hit=false;
        for(var k in ov){ if(k.indexOf(sc.scalar)!==-1){ hit=true; break; } }
        if(hit) ok++; else miss.push({guid:guid, why:'no override', keys:Object.keys(ov).length});
      }
      return JSON.stringify({total:window.__targets.length, recorded:ok,
                             missing:miss.length, sample:miss.slice(0,5)});})()""")
    if not isinstance(res, dict):
        print("FAIL: could not verify"); return 1

    print(f"recorded {res['recorded']}/{res['total']}", flush=True)
    if res["missing"] > 0:
        print(f"FAIL: {res['missing']} edits were silently lost (GH #28). Sample:")
        for m in res["sample"]:
            print("   ", json.dumps(m))
        return 1
    print(f"PASS: all {res['total']} edits recorded, none lost")
    return 0


if __name__ == "__main__":
    sys.exit(main())
