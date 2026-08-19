#!/usr/bin/env python3
"""Reference chips must RESOLVE and OPEN.

Guards a regression that reached a build: ReferenceProperty resolved its target only in mounted(),
which runs once. The inspector renders a chip before the partition it describes has loaded, so the
`reference` prop usually arrives afterwards — the component returned early and then sat at its
initial state forever. Visibly: the chip pulses (the `loading` class animation) and clicking does
nothing, because toggle() refuses to expand while `instance` is null.

Both halves are asserted. "Chips exist" alone passes while every one of them is stuck.

Usage:  python3 inspector_chips_e2e.py [--addr localhost:8884]
Exit 0 = chips resolve and expand, 1 = stuck or unclickable, 2 = could not set up.
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
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)

    # Select objects until one renders reference chips.
    found = None
    for _ in range(20):
        cdp_eval(addr, """(function(){
          var d=window.editor.gameObjects, ks=d.keys();
          window.__n=(window.__n||0); var g=null, seen=0;
          for(var i=0;i<ks.length;i++){ var o=d.getValue(ks[i]);
            if(!o||o.origin!==1||!o.blueprintCtrRef) continue;
            if(seen++ < window.__n) continue; g=o; break; }
          window.__n++; if(!g) return 'none';
          window.editor.selectionGroup.select(g,false,false);
          var insp=document.querySelector('.inspector-component');
          if(insp&&insp.__vue__) insp.__vue__.selectedGameObject=g;
          return String(g.name).slice(0,40);})()""")
        time.sleep(8)
        st = cdp_eval(addr, "(function(){return JSON.stringify({n:document.querySelectorAll('.reference-property').length});})()")
        if isinstance(st, dict) and st.get("n", 0) > 0:
            found = st
            break
    if not found:
        print("SETUP: no object rendered a reference chip"); return 2
    print(f"{found['n']} reference chip(s)", flush=True)

    # 1. none may still be loading
    state = cdp_eval(addr, """(function(){
      var rps=document.querySelectorAll('.reference-property'), stuck=0, resolved=0, types=[];
      for(var i=0;i<rps.length;i++){ var vm=rps[i].__vue__; if(!vm) continue;
        if(vm.loading) stuck++;
        if(vm.instance){ resolved++; if(types.length<5) types.push(String(vm.instance.typeName)); } }
      var pulsing=0, boxes=document.querySelectorAll('.ReferenceBox');
      for(var i=0;i<boxes.length;i++){ if((boxes[i].className||'').indexOf('loading')!==-1) pulsing++; }
      return JSON.stringify({chips:rps.length, stuck:stuck, resolved:resolved,
                             pulsing:pulsing, types:types});})()""")
    print("state:", json.dumps(state), flush=True)
    if not isinstance(state, dict):
        print("FAIL: could not read chip state"); return 1
    if state.get("stuck", 0) > 0 or state.get("pulsing", 0) > 0:
        print(f"FAIL: {state['stuck']} chip(s) still loading, {state['pulsing']} pulsing — "
              f"the reference prop arrived after mount and nothing re-resolved")
        return 1
    if state.get("resolved", 0) == 0:
        print("FAIL: no chip resolved its target"); return 1

    # 2. a resolved chip must actually open when clicked
    r = cdp_eval(addr, """(function(){
      var rps=document.querySelectorAll('.reference-property'), target=null;
      for(var i=0;i<rps.length;i++){ var vm=rps[i].__vue__;
        if(vm && vm.instance && !vm.expanded){ target=rps[i]; break; } }
      if(!target) return JSON.stringify({clicked:false, why:'no collapsed resolved chip'});
      var box=target.querySelector('.ReferenceBox');
      var r=box.getBoundingClientRect(), cx=r.x+r.width/2, cy=r.y+r.height/2;
      ['mouseover','mousedown','mouseup','click'].forEach(function(e){
        box.dispatchEvent(new MouseEvent(e,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy,button:0}));});
      window.__chip=target;
      return JSON.stringify({clicked:true});})()""")
    if not (isinstance(r, dict) and r.get("clicked")):
        print("SKIP: everything was already expanded —", json.dumps(r))
        print(f"PASS: {state['resolved']}/{state['chips']} chips resolved, none stuck")
        return 0
    time.sleep(3)
    after = cdp_eval(addr, "(function(){var vm=window.__chip&&window.__chip.__vue__;return JSON.stringify({expanded: vm?vm.expanded:null});})()")
    if not (isinstance(after, dict) and after.get("expanded")):
        print("FAIL: a resolved chip did not expand when clicked:", json.dumps(after)); return 1

    print(f"PASS: {state['resolved']}/{state['chips']} chips resolved ({', '.join(state['types'])}), "
          f"none pulsing, and one expanded on click")
    return 0


if __name__ == "__main__":
    sys.exit(main())
