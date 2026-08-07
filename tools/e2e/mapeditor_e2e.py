#!/usr/bin/env python3
"""MapEditor end-to-end test harness.

Drives the in-game editor over Chrome DevTools Protocol (CDP) and runs assertions against the
live WebUI + ext, so editor behaviour can be verified without a human clicking through the game.

How it avoids physical input
----------------------------
The client can't be driven with a real mouse/keyboard from a script, and the editor normally needs
`deploy + F1`. With `ME_CONFIG.DEV_AUTO_ENTER_EDITOR = true` (Config.lua) the client auto-enters the
editor once the level finishes loading (UIManager:DevEnterEditor), so this harness only has to wait
for `window.editor` to be ready and then evaluate JS.

Prerequisites
-------------
  * VU server running the MapEditor mod, and a client joined with `-dwebui` (CDP on :8884),
    launched e.g. via:  powos mods vu play "vu://join/<guid>" -dwebui
  * ME_CONFIG.DEV_AUTO_ENTER_EDITOR = true  (so the editor opens itself)
  * vu-cdp.py present (defaults to the PowOS path below; override with $VU_CDP_PY)

Usage
-----
  python3 mapeditor_e2e.py [--addr localhost:8884]

Exit code is non-zero if any test fails, so it can gate CI.
"""
import argparse
import json
import os
import subprocess
import sys
import time

VU_CDP_PY = os.environ.get("VU_CDP_PY", "/var/lib/powos/src/lib/mods/vu-cdp.py")


# ── CDP plumbing ──────────────────────────────────────────────────────────────
def cdp_eval(addr, js, timeout=30, target="mapeditor"):
    """Evaluate JS on a WebUI page (default the `mapeditor` editor page). The JS should RETURN a
    JSON string; we parse the last non-empty stdout line as JSON (falls back to raw for errors)."""
    try:
        p = subprocess.run(
            ["python3", VU_CDP_PY, "--addr", addr, "--target", target, "eval", js],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"__error": "cdp eval timed out"}
    for line in reversed((p.stdout or "").strip().splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except Exception:
            return {"__raw": line}
    err = (p.stderr or "").strip()
    return {"__error": err or "no output"}


def enter_game(addr, timeout=180):
    """From the soldier-select screen, click the first real soldier (which triggers the server
    join); the ext then auto-enters the editor (DEV_AUTO_ENTER_EDITOR) a few seconds after
    Level:Loaded. Returns True once a `mapeditor` CDP target exists. No physical input required —
    Gameface elements have no .click(), so we dispatch a real mouse-event sequence."""
    click_js = ("(function(){var els=document.querySelectorAll('.soldier-entry');var t=null;"
                "for(var i=0;i<els.length;i++){if((els[i].className||'').toString().indexOf('empty')===-1){t=els[i];break;}}"
                "if(!t)return JSON.stringify({clicked:false});var r=t.getBoundingClientRect();"
                "var cx=r.x+r.width/2,cy=r.y+r.height/2;"
                "['mouseover','mousedown','mouseup','click'].forEach(function(e){"
                "t.dispatchEvent(new MouseEvent(e,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy,button:0}));});"
                "return JSON.stringify({clicked:true,name:(t.textContent||'').trim().slice(0,20)});})()")
    deadline = time.time() + timeout
    clicked = False
    while time.time() < deadline:
        # Already in the editor?
        if _has_mapeditor_target(addr):
            return True
        if not clicked:
            r = cdp_eval(addr, click_js, target="main/players")
            if isinstance(r, dict) and r.get("clicked"):
                print(f"[e2e] clicked soldier '{r.get('name')}' — joining + auto-enter…")
                clicked = True
        time.sleep(4)
    return _has_mapeditor_target(addr)


def _has_mapeditor_target(addr):
    try:
        p = subprocess.run(["python3", VU_CDP_PY, "--addr", addr, "targets"],
                           capture_output=True, text=True, timeout=15)
        return "webui://mapeditor" in (p.stdout or "")
    except Exception:
        return False


def wait_for_editor(addr, timeout=150):
    """Block until the editor + gameObjectManager exist and some objects are registered."""
    js = ("(function(){try{var e=window.editor;"
          "var n=e&&e.gameObjects&&e.gameObjects.size?e.gameObjects.size():0;"
          "return JSON.stringify({ready:!!(e&&e.gameObjects),count:n});}"
          "catch(x){return JSON.stringify({ready:false,err:String(x)});}})()")
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = cdp_eval(addr, js)
        last = r
        if isinstance(r, dict) and r.get("ready") and r.get("count", 0) > 0:
            return r
        time.sleep(3)
    return {"__error": "editor not ready in time", "last": last}


# ── Test registry ─────────────────────────────────────────────────────────────
TESTS = []


def test(name):
    def deco(fn):
        TESTS.append((name, fn))
        return fn
    return deco


@test("game objects registered")
def t_objects(addr):
    r = cdp_eval(addr, "(function(){return JSON.stringify({count:window.editor.gameObjects.size()});})()")
    n = r.get("count", 0) if isinstance(r, dict) else 0
    assert n > 0, f"expected >0 tracked game objects, got {n} ({r})"
    return f"{n} objects tracked (incl. NoHavok statics)"


@test("select first object")
def t_select(addr):
    r = cdp_eval(addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values();
      if(!vals.length) return JSON.stringify({err:'no objects'});
      var go=vals[0];
      e.selectionGroup.select(go, false, false);
      var sel=e.selectionGroup.selectedGameObjects||[];
      return JSON.stringify({selected: sel.length, name: sel[0]&&sel[0].name});
    })()""")
    assert isinstance(r, dict) and r.get("selected", 0) >= 1, f"selection failed ({r})"
    return f"selected {r.get('name')}"


@test("reference resolves globally (VehicleSpawn-style)")
def t_reference(addr):
    # Find any VehicleSpawnReferenceObjectData (or any instance with a `blueprint` reference), take
    # its blueprint reference's instance guid, and resolve it via the WebUI+server global-search
    # path. Asserts the target instance comes back (proves the zero-partition-guid fallback works).
    r = cdp_eval(addr, """(function(){
      var fm=window.editor.fbdMan;
      var vals = fm.partitions && fm.partitions.values ? fm.partitions.values()
               : (fm.partitions ? Object.values(fm.partitions) : []);
      var target=null;
      for(var i=0;i<vals.length && !target;i++){
        var p=vals[i]; if(!p||!p.instances) continue;
        for(var g in p.instances){
          var inst=p.instances[g];
          var bp = inst && inst.fields && inst.fields.blueprint && inst.fields.blueprint.value;
          if(bp && bp.instanceGuid){ target={type:inst.typeName, instGuid: bp.instanceGuid.toString()}; break; }
        }
      }
      if(!target) return JSON.stringify({skip:'no blueprint reference found in cached partitions'});
      // Resolve globally by instance guid (mirrors ReferenceProperty.resolveGlobally).
      var ig=target.instGuid;
      var part=fm.registerPartition(ig, ig, ig);
      window.__e2eRefResult=null;
      part.data.then(function(){
        var inst=part.instances[ig.toLowerCase()];
        window.__e2eRefResult={resolved: !!inst, type: inst&&inst.typeName,
                               name: inst&&inst.fields&&inst.fields.name?String(inst.fields.name.value):null};
      }).catch(function(err){ window.__e2eRefResult={resolved:false, err:String(err)}; });
      return JSON.stringify({dispatched:true, refType:target.type, instGuid:ig});
    })()""")
    if isinstance(r, dict) and r.get("skip"):
        return "SKIP: " + r["skip"]
    assert isinstance(r, dict) and r.get("dispatched"), f"could not dispatch ref resolve ({r})"
    # Poll for the async resolution result.
    for _ in range(20):
        res = cdp_eval(addr, "(function(){return JSON.stringify(window.__e2eRefResult);})()")
        if isinstance(res, dict) and "resolved" in res:
            assert res.get("resolved"), f"reference did NOT resolve ({res})"
            return f"resolved {res.get('type')} name={res.get('name')}"
        time.sleep(1)
    raise AssertionError("reference resolve timed out")


# ── Runner ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default=os.environ.get("VU_CDP_ADDR", "localhost:8884"))
    args = ap.parse_args()

    print(f"[e2e] entering game on {args.addr} (soldier click + auto-enter)…")
    if not enter_game(args.addr):
        print("[e2e] FATAL: could not reach the editor (no mapeditor target after soldier click)")
        return 2
    print("[e2e] editor target present; waiting for it to initialise…")
    ready = wait_for_editor(args.addr)
    if not (isinstance(ready, dict) and ready.get("ready")):
        print(f"[e2e] FATAL: editor never became ready: {ready}")
        return 2
    print(f"[e2e] editor ready — {ready.get('count')} objects\n")

    passed = failed = 0
    for name, fn in TESTS:
        try:
            msg = fn(args.addr)
            if isinstance(msg, str) and msg.startswith("SKIP"):
                print(f"[e2e]  ~  {name}: {msg}")
            else:
                print(f"[e2e] PASS {name}: {msg}")
                passed += 1
        except AssertionError as e:
            print(f"[e2e] FAIL {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"[e2e] ERR  {name}: {e}")
            failed += 1

    print(f"\n[e2e] {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
