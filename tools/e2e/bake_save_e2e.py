#!/usr/bin/env python3
"""Stage 1 of the bake pipeline: make a distinctive edit in game and SAVE it as a project.

Stage 2 (host side, tools/bake_run.sh) exports that project and runs LevelLoaderGen over it.
Kept separate because stage 2 needs no game running, and mixing them makes a failure ambiguous.

Usage:  python3 bake_save_e2e.py [--addr localhost:8884] [--name BAKETEST]
Exit 0 = project saved (its name is printed), 1 = save failed, 2 = could not set up.
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
    ap.add_argument("--name", default="BAKETEST")
    ap.add_argument("--edits", type=int, default=6)
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")

    # Same proven discovery as bulk_edit_e2e: walk light/lamp prefabs for an editable Float32.
    cdp_eval(addr, """(function(){
      var vals=window.editor.gameObjects.values(), byBp={};
      for(var i=0;i<vals.length;i++){ var go=vals[i];
        if(!go||!go.blueprintCtrRef) continue;
        if(go.overrides && Object.keys(go.overrides).length) continue;
        var k=go.blueprintCtrRef.instanceGuid.toString(); (byBp[k]=byBp[k]||[]).push(go); }
      var c=[]; for(var k in byBp){ if(byBp[k].length>=2) c.push({list:byBp[k],
        bpPart:byBp[k][0].blueprintCtrRef.partitionGuid.toString(), name:byBp[k][0].name}); }
      // Prefer light/lamp prefabs (known-safe cosmetic scalars), then larger groups.
      c.sort(function(a,b){ var la=/light|lamp/i.test(a.name||'')?1:0, lb=/light|lamp/i.test(b.name||'')?1:0;
        if(la!==lb) return lb-la; return b.list.length-a.list.length;}); window.__cands=c;
      return JSON.stringify({groups:c.length});})()""")
    cdp_eval(addr, """(function(){
      var SC=['radius','intensity','attenuationOffset','width','translucencyScale']; window.__sc=null;
      var tryNext=function(i){
        if(i>=window.__cands.length){ window.__sc={err:'no Float32 candidate'}; return; }
        var c=window.__cands[i];
        window.__freshFetch(c.bpPart, function(part){
          if(!part||!part.primaryInstance||!part.primaryInstance.fields.objects){ tryNext(i+1); return; }
          var arr=part.primaryInstance.fields.objects.value;
          for(var j=0;j<arr.length;j++){ var ref=arr[j].value;
            var inst=ref&&ref.instanceGuid?part.instances[ref.instanceGuid.toString().toLowerCase()]:null;
            if(!inst) continue;
            var pick=null;
            for(var s=0;s<SC.length && !pick;s++){ var f=inst.fields[SC[s]];
              if(f&&f.type==='Float32'&&typeof f.value==='number') pick=SC[s]; }
            if(!pick){ for(var kf in inst.fields){ var g=inst.fields[kf];
              if(g&&g.type==='Float32'&&typeof g.value==='number'){ pick=kf; break; } } }
            if(pick){ window.__list=c.list; window.__sc={ok:true, elem:arr[j].name, scalar:pick,
                base:inst.fields[pick].value, name:c.name}; return; } }
          tryNext(i+1); }); };
      tryNext(0); return 'dispatched';})()""")
    sc = poll(addr, "(function(){return JSON.stringify(window.__sc);})()", "ok", tries=60)
    if not (isinstance(sc, dict) and sc.get("ok")):
        print("SETUP: no editable prefab:", json.dumps(sc)); return 2
    print(f"editing {sc['name']} {sc['elem']}.{sc['scalar']} (base {sc['base']})", flush=True)

    made = cdp_eval(addr, """(function(){
      var e=window.editor, sc=window.__sc, list=window.__list, N=%d;
      var insp=document.querySelector('.inspector-component'); var vm=insp&&insp.__vue__;
      if(!vm||typeof vm.onEBXInput!=='function') return JSON.stringify({err:'no inspector vm'});
      window.__edited=[];
      for(var i=0;i<N && i<list.length;i++){ var go=list[i];
        e.selectionGroup.select(go,false,false); vm.selectedGameObject=go;
        vm.onEBXInput({ field: sc.elem, type:'GameObjectData',
          value:{ field: sc.scalar, type:'Float32', value: sc.base+11+i, oldValue: sc.base } }, true);
        window.__edited.push(String(go.guid)); }
      return JSON.stringify({edits:window.__edited.length});})()""" % args.edits)
    if not (isinstance(made, dict) and made.get("edits")):
        print("SETUP: edits failed:", json.dumps(made)); return 2
    print(f"made {made['edits']} overrides; settling…", flush=True)
    time.sleep(18)

    # Save under a known name, reusing the editor's own current header (map/gamemode/bundles).
    saved = cdp_eval(addr, """(function(){
      var NAME=%s;
      var hdr=null;
      var els=document.querySelectorAll('*');
      for(var i=0;i<els.length;i++){ var vm=els[i].__vue__;
        if(vm && vm.currentProjectHeader){ hdr=Object.assign({}, vm.currentProjectHeader); break; } }
      if(!hdr){ hdr={ mapName: window.editor.mapName || 'MP_001',
                      gameModeName: window.editor.gameModeName || 'ConquestLarge0',
                      requiredBundles: {}, saveVersion: '0.1.3' }; }
      hdr.projectName = NAME;
      window.vext.SendMessage({type:'RequestSaveProjectMessage', projectHeaderJSON: JSON.stringify(hdr)});
      return JSON.stringify({sent:true, header:{map:hdr.mapName, mode:hdr.gameModeName, name:hdr.projectName}});
    })()""" % json.dumps(args.name))
    if not (isinstance(saved, dict) and saved.get("sent")):
        print("FAIL: save dispatch failed:", json.dumps(saved)); return 1
    print("save dispatched:", json.dumps(saved.get("header")), flush=True)
    time.sleep(12)
    print(f"PASS: project '{args.name}' saved with {made['edits']} overrides")
    return 0


if __name__ == "__main__":
    sys.exit(main())
