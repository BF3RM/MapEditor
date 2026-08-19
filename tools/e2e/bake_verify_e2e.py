#!/usr/bin/env python3
"""Stage 3 of the bake pipeline: load the BAKED level and confirm the edits are actually in it.

Stage 1 (bake_save_e2e.py) made N overrides on one light prefab and saved a project. Stage 2
(host side) exported it and ran LevelLoaderGen, which emits one override partition per edited
instance plus a loader script that EXCLUDES the vanilla ReferenceObjectDatas they replace.

This runs with the generated mod enabled and NO project loaded, so anything it sees comes from the
bake and not from the editor: the vanilla lights must have been excluded and replaced by instances
whose blueprint carries the edited value.

Usage:  python3 bake_verify_e2e.py [--addr localhost:8884] [--scalar radius] [--base 5]
Exit 0 = the baked edits are present, 1 = they are not, 2 = could not set up.
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--match", default="CeilingLight_02")
    ap.add_argument("--scalar", default="radius")
    ap.add_argument("--base", type=float, default=5.0)
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")

    # Collect every DISTINCT blueprint used by objects of this prefab family. The baked instances
    # point at override partitions, so they show up as blueprints the vanilla level never had.
    cdp_eval(addr, """(function(){
      var d=window.editor.gameObjects, ks=d.keys(), seen={}, out=[];
      for(var i=0;i<ks.length;i++){ var g=d.getValue(ks[i]);
        if(!g||!g.blueprintCtrRef) continue;
        if(String(g.name||'').indexOf(%s)===-1) continue;
        var k=String(g.blueprintCtrRef.partitionGuid);
        if(seen[k]) continue; seen[k]=1;
        out.push({part:k, name:String(g.name)}); }
      window.__bps=out;
      return JSON.stringify({distinctBlueprints:out.length});})()""" % json.dumps(args.match))
    bps = cdp_eval(addr, "(function(){return JSON.stringify({n:window.__bps.length});})()")
    n = bps.get("n", 0) if isinstance(bps, dict) else 0
    if n == 0:
        print(f"SETUP: no objects matching {args.match}"); return 2
    print(f"{n} distinct blueprint partition(s) used by {args.match}", flush=True)

    # Read the scalar out of each one.
    cdp_eval(addr, """(function(){
      window.__vals=[]; window.__done=0;
      var SC=%s;
      window.__bps.forEach(function(b){
        window.__freshFetch(b.part, function(part){
          window.__done++;
          if(!part||!part.primaryInstance||!part.primaryInstance.fields.objects) return;
          var arr=part.primaryInstance.fields.objects.value;
          for(var j=0;j<arr.length;j++){ var ref=arr[j].value;
            var inst=ref&&ref.instanceGuid?part.instances[String(ref.instanceGuid).toLowerCase()]:null;
            if(!inst) continue;
            var f=inst.fields[SC];
            if(f && typeof f.value==='number'){ window.__vals.push({part:b.part, v:f.value}); return; } }
        });
      });
      return 'dispatched';})()""" % json.dumps(args.scalar))
    for _ in range(40):
        time.sleep(2)
        st = cdp_eval(addr, "(function(){return JSON.stringify({done:window.__done, total:window.__bps.length, vals:window.__vals});})()")
        if isinstance(st, dict) and st.get("done", 0) >= st.get("total", 1):
            break

    vals = st.get("vals", []) if isinstance(st, dict) else []
    if not vals:
        print("FAIL: could not read", args.scalar, "from any blueprint"); return 1

    edited = [v for v in vals if abs(v["v"] - args.base) > 0.01]
    print(f"{args.scalar} values across blueprints:", json.dumps([v["v"] for v in vals]), flush=True)
    if not edited:
        print(f"FAIL: every blueprint still reads the vanilla {args.scalar}={args.base} — "
              f"the bake did not take effect")
        return 1
    print(f"PASS: {len(edited)} blueprint(s) carry a baked non-vanilla {args.scalar}: "
          f"{json.dumps([v['v'] for v in edited])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
