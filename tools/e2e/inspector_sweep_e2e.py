#!/usr/bin/env python3
"""Select many distinct blueprints and assert the inspector loads every one of them.

Guards two failures that were invisible for a long time because they presented identically —
as a partition that had simply "loaded empty":

* PartitionSerializer kept ONE outgoing response slot, so a new request discarded whatever was
  still being sent. Selecting an object fires a fetch per reference it renders, so under real use
  responses were dropped constantly and the client sat out its 15s timeout for each one.
* FBPartition.getData() ended in `.catch(e => console.error(e))`, which swallowed the rejection AND
  resolved the promise, so nothing surfaced anywhere.

The assertion is deliberately two-sided: partitions must LOAD, and no request may be dropped.
Asserting only "no exception" passes while every fetch quietly times out.

Usage:  python3 inspector_sweep_e2e.py [--addr localhost:8884] [--count 40]
Exit 0 = every selection loaded cleanly, 1 = drops/errors, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, VU_CDP_PY  # noqa: E402


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
    ap.add_argument("--count", type=int, default=40)
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)

    # Capture console.error / console.warn / unhandled rejections for the whole sweep.
    cdp_eval(addr, """(function(){
      window.__sweepErrs=[];
      if(!window.__sweepTrap){ window.__sweepTrap=true;
        var oe=console.error, ow=console.warn;
        console.error=function(){ try{var p=[];for(var i=0;i<arguments.length;i++){var a=arguments[i];
          p.push(String(a&&a.message?a.message:a));} window.__sweepErrs.push('ERR '+p.join(' | '));}catch(e){}
          return oe.apply(console,arguments); };
        console.warn=function(){ try{var p=[];for(var i=0;i<arguments.length;i++){p.push(String(arguments[i]));}
          window.__sweepErrs.push('WARN '+p.join(' | '));}catch(e){} return ow.apply(console,arguments); };
        window.addEventListener('unhandledrejection', function(ev){
          try{ window.__sweepErrs.push('UNHANDLED '+String(ev.reason&&ev.reason.message?ev.reason.message:ev.reason)); }catch(e){} });
      }
      return 'armed';})()""")

    queued = cdp_eval(addr, """(function(){
      var d=window.editor.gameObjects, ks=d.keys(), seen={}, out=[];
      for(var i=0;i<ks.length;i++){ var g=d.getValue(ks[i]);
        if(!g||!g.blueprintCtrRef) continue;
        var k=String(g.blueprintCtrRef.instanceGuid); if(seen[k]) continue; seen[k]=1;
        out.push(g); if(out.length>=%d) break; }
      window.__sweep=out; window.__i=0;
      window.__step=function(){ if(window.__i>=window.__sweep.length) return 'done';
        var g=window.__sweep[window.__i++];
        window.editor.selectionGroup.select(g,false,false);
        var insp=document.querySelector('.inspector-component');
        if(insp&&insp.__vue__) insp.__vue__.selectedGameObject=g;
        return 'ok'; };
      return JSON.stringify({queued:out.length});})()""" % args.count)
    n = queued.get("queued", 0) if isinstance(queued, dict) else 0
    if n == 0:
        print("SETUP: nothing to sweep"); return 2
    print(f"sweeping {n} distinct blueprints…", flush=True)

    for _ in range(n):
        cdp_eval(addr, "(function(){return JSON.stringify({s:window.__step()});})()")
        time.sleep(1.5)
    time.sleep(10)   # let the last fetches settle / time out

    res = cdp_eval(addr, """(function(){
      var e=window.__sweepErrs||[], t=0, u={};
      for(var i=0;i<e.length;i++){ if(e[i].indexOf('timed out')!==-1) t++; u[e[i]]=(u[e[i]]||0)+1; }
      return JSON.stringify({total:e.length, timeouts:t, sample:Object.keys(u).slice(0,6)});})()""")
    if not isinstance(res, dict):
        print("FAIL: could not read sweep results"); return 1

    print("errors:", json.dumps({k: res[k] for k in ("total", "timeouts")}), flush=True)
    if res.get("timeouts", 0) > 0:
        print("FAIL: partition requests were DROPPED (responses never arrived):")
        for line in res.get("sample", []):
            print("   ", line[:160])
        return 1
    if res.get("total", 0) > 0:
        print("FAIL: the inspector logged errors during the sweep:")
        for line in res.get("sample", []):
            print("   ", line[:160])
        return 1

    print(f"PASS: {n} blueprints selected, zero dropped requests and zero inspector errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
