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
        if(p.name && p.name.indexOf('e2e_probe_')===0) continue;  // skip harness probes
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


_FRESH_FETCH_JS = """
// Re-fetch a partition from the SERVER, bypassing the WebUI cache, by registering it under a
// unique key (each key builds a new FBPartition -> new request). The server serializes the LIVE
// DataContainers, so this reads the real current state of the shared blueprint.
window.__freshFetch = function(partGuid, cb){
  var fm = window.editor.fbdMan;
  window.__probeN = (window.__probeN || 0) + 1;
  var key = String(partGuid).toLowerCase();
  var prev = fm.partitionGuids.getValue(key);          // remember the editor's real mapping
  var p = fm.registerPartition('e2e_probe_' + window.__probeN, partGuid);
  if (prev) { fm.partitionGuids.setValue(key, prev); } // ...and restore it: probes must not
                                                       // become what the editor resolves by guid
  p.data.then(function(){ cb(p, null); }).catch(function(e){ cb(null, String(e)); });
};
"""


def _poll(addr, js, key, tries=25, delay=1):
    """Poll a window.<var> until it is non-null."""
    for _ in range(tries):
        r = cdp_eval(addr, js)
        if isinstance(r, dict) and r.get(key) is not None:
            return r
        time.sleep(delay)
    return None


@test("per-instance override isolates the prefab; Apply writes the shared blueprint")
def t_apply_to_blueprint(addr):
    """The full Unity-prefab contract, verified against SERVER state (not just the UI):
       edit one instance -> shared blueprint must be UNCHANGED (M1 isolation);
       then Apply to Blueprint -> shared blueprint must now carry the value (M3)."""
    # 1. Discover a multi-instance light prefab and read the shared blueprint's baseline.
    cdp_eval(addr, "(function(){" + _FRESH_FETCH_JS + "return 'ok';})()")
    setup = cdp_eval(addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values(), byBp={};
      for(var i=0;i<vals.length;i++){
        var go=vals[i]; if(!go||!go.blueprintCtrRef) continue;
        if(!/light|lamp/i.test(go.name||'')) continue;
        if(go.overrides && Object.keys(go.overrides).length) continue;  // untouched only
        var k=go.blueprintCtrRef.instanceGuid.toString();
        (byBp[k]=byBp[k]||[]).push(go);
      }
      var cands=[];
      for(var k in byBp){
        if(byBp[k].length>=2){
          cands.push({a:byBp[k][0], b:byBp[k][1], bpPart:byBp[k][0].blueprintCtrRef.partitionGuid.toString(),
                      name:byBp[k][0].name, siblings:byBp[k].length});
        }
      }
      window.__cands=cands;
      return JSON.stringify({count:cands.length, names:cands.slice(0,5).map(function(c){return c.name;})});
    })()""")
    if not (isinstance(setup, dict) and setup.get("count", 0) > 0):
        return "SKIP: no light prefab with >=2 instances on this map"

    # 2. Baseline: walk candidates until one exposes an editable Float32 under objects[], and read
    #    that scalar straight from the shared blueprint on the SERVER.
    cdp_eval(addr, """(function(){
      var SCALARS=['radius','intensity','attenuationOffset','width','translucencyScale'];
      window.__base=null;
      var tryNext=function(i){
        if(i>=window.__cands.length){ window.__base={err:'no candidate exposed a Float32 scalar'}; return; }
        var c=window.__cands[i];
        window.__freshFetch(c.bpPart, function(part, err){
          if(!part || !part.primaryInstance || !part.primaryInstance.fields.objects){ tryNext(i+1); return; }
          var arr=part.primaryInstance.fields.objects.value;
          for(var j=0;j<arr.length;j++){
            var ref=arr[j].value;
            var inst=ref&&ref.instanceGuid? part.instances[ref.instanceGuid.toString().toLowerCase()]:null;
            if(!inst) continue;
            for(var s=0;s<SCALARS.length;s++){
              var f=inst.fields[SCALARS[s]];
              if(f && f.type==='Float32' && typeof f.value==='number'){
                window.__ap={a:c.a,b:c.b,bpPart:c.bpPart,name:c.name,siblings:c.siblings,
                             elemField:arr[j].name, scalar:SCALARS[s]};
                window.__base={value:f.value, elem:arr[j].name, scalar:SCALARS[s], type:inst.typeName, name:c.name};
                return;
              }
            }
          }
          tryNext(i+1);
        });
      };
      tryNext(0);
      return 'dispatched';
    })()""")
    base = _poll(addr, "(function(){return JSON.stringify(window.__base);})()", "value", tries=40)
    if base is None:
        r = cdp_eval(addr, "(function(){return JSON.stringify(window.__base);})()")
        return f"SKIP: could not read blueprint baseline ({r})"
    baseline = base["value"]
    scalar = base["scalar"]
    setup = {"name": base.get("name", "?"), "siblings": "?"}
    new_value = round(baseline + 37.0, 3)

    # 3. Edit ONE instance through the real inspector path (SetEBXFieldCommand).
    edit = cdp_eval(addr, """(function(){
      var e=window.editor, ap=window.__ap;
      e.selectionGroup.select(ap.a, false, false);
      var insp=document.querySelector('.inspector-component');
      var vm=insp && insp.__vue__;
      if(!vm || typeof vm.onEBXInput!=='function') return JSON.stringify({err:'inspector vm unavailable'});
      vm.selectedGameObject = ap.a;
      vm.onEBXInput({ field: ap.elemField, type:'GameObjectData',
                      value:{ field: ap.scalar, type:'Float32', value:""" + str(new_value) + """,
                              oldValue:""" + str(baseline) + """ } }, true);
      return JSON.stringify({sent:true, path:'objects.'+ap.elemField+'.'+ap.scalar});
    })()""")
    assert isinstance(edit, dict) and edit.get("sent"), f"edit dispatch failed ({edit})"
    time.sleep(4)  # debounce + re-instantiation

    # 4. ISOLATION: the shared blueprint must still hold the baseline.
    cdp_eval(addr, """(function(){
      window.__iso=null;
      window.__freshFetch(window.__ap.bpPart, function(part, err){
        if(!part){ window.__iso={err:err}; return; }
        var arr=part.primaryInstance.fields.objects.value;
        for(var i=0;i<arr.length;i++){
          if(arr[i].name!==window.__ap.elemField) continue;
          var inst=part.instances[arr[i].value.instanceGuid.toString().toLowerCase()];
          var f=inst && inst.fields[window.__ap.scalar]; window.__iso={value: f? f.value : null};
          return;
        }
        window.__iso={err:'elem gone'};
      });
      return 'dispatched';
    })()""")
    iso = _poll(addr, "(function(){return JSON.stringify(window.__iso);})()", "value")
    assert iso is not None, "isolation probe never resolved"
    assert abs(iso["value"] - baseline) < 0.01, (
        f"ISOLATION BROKEN: shared blueprint changed to {iso['value']} after a per-instance edit "
        f"(expected baseline {baseline}) — the edit leaked to every instance")

    # 5. Apply to Blueprint (same command the panel button sends).
    cdp_eval(addr, """(function(){
      window.vext.SendCommand({type:'ApplyBlueprintOverridesCommand', sender: window.editor.playerName,
        gameObjectTransferData:{ guid: window.__ap.a.guid.toString(), overrides: [] }});
      return 'applied';
    })()""")
    time.sleep(5)

    # 6. APPLY: the shared blueprint must now carry the new value.
    cdp_eval(addr, """(function(){
      window.__post=null;
      window.__freshFetch(window.__ap.bpPart, function(part, err){
        if(!part){ window.__post={err:err}; return; }
        var arr=part.primaryInstance.fields.objects.value;
        for(var i=0;i<arr.length;i++){
          if(arr[i].name!==window.__ap.elemField) continue;
          var inst=part.instances[arr[i].value.instanceGuid.toString().toLowerCase()];
          var f=inst && inst.fields[window.__ap.scalar]; window.__post={value: f? f.value : null};
          return;
        }
        window.__post={err:'elem gone'};
      });
      return 'dispatched';
    })()""")
    post = _poll(addr, "(function(){return JSON.stringify(window.__post);})()", "value")
    assert post is not None, "post-apply probe never resolved"
    assert abs(post["value"] - new_value) < 0.01, (
        f"APPLY FAILED: shared blueprint radius is {post['value']}, expected {new_value} "
        f"(baseline was {baseline}) — Apply to Blueprint did not write the base")

    return (f"{setup['name'].split('/')[-1]}.{scalar}: shared base stayed {baseline} during the "
            f"per-instance edit, then Apply wrote {post['value']}")


@test("repeated edits do not leak GameObjects")
def t_no_leak(addr):
    """Re-instantiating a prefab spawns fresh child GameObjects. If the previous incarnation's
    children aren't untracked, every edit leaks one (they'd also be written into the save). Assert
    the total tracked-object count is stable across several edits."""
    probe = cdp_eval(addr, """(function(){
      var ap=window.__ap;
      if(!ap) return JSON.stringify({skip:'no target from the apply test'});
      var e=window.editor, go=ap.b;
      var insp=document.querySelector('.inspector-component'), vm=insp&&insp.__vue__;
      if(!vm||typeof vm.onEBXInput!=='function') return JSON.stringify({skip:'inspector vm unavailable'});
      e.selectionGroup.select(go,false,false); vm.selectedGameObject=go;
      window.__leak={samples:[], done:false};
      var snap=function(t){ window.__leak.samples.push({tag:t,total:e.gameObjects.size(),kids:go.children.length}); };
      [0,1,2].forEach(function(i){
        setTimeout(function(){
          vm.onEBXInput({field:ap.elemField,type:'GameObjectData',
            value:{field:ap.scalar,type:'Float32',value:300+i,oldValue:299+i}}, true);
          setTimeout(function(){ snap('edit'+(i+1)); if(i===2) window.__leak.done=true; }, 1500);
        }, i*2500);
      });
      return JSON.stringify({started:true});
    })()""")
    if isinstance(probe, dict) and probe.get("skip"):
        return "SKIP: " + probe["skip"]
    res = _poll(addr, "(function(){var l=window.__leak;return JSON.stringify(l&&l.done?"
                      "{done:true,samples:l.samples}:{done:null});})()", "done", tries=20)
    assert res is not None, "leak probe never finished"
    totals = [s["total"] for s in res["samples"]]
    kids = [s["kids"] for s in res["samples"]]
    growth = totals[-1] - totals[0]
    assert growth <= 0, (
        f"LEAK: tracked objects grew {totals} across 3 edits (+{growth}) and children went {kids} — "
        f"each re-instantiation is leaving its predecessor's children behind")
    return f"objects stable across 3 edits ({totals}), children {kids}"


@test("rapid edits coalesce into few respawns (drag debounce)")
def t_debounce(addr):
    """A slider drag fires an EBX edit per tick. Each one used to delete+respawn immediately (71
    respawns in seconds froze the client). Every respawn rebuilds the object's child GameObjects
    with fresh guids, so counting distinct child guids while spamming edits measures the real
    respawn count."""
    probe = cdp_eval(addr, """(function(){
      var ap=window.__ap;
      if(!ap) return JSON.stringify({skip:'apply test did not run (no target)'});
      var go=ap.a, insp=document.querySelector('.inspector-component'), vm=insp&&insp.__vue__;
      if(!vm||typeof vm.onEBXInput!=='function') return JSON.stringify({skip:'inspector vm unavailable'});
      window.editor.selectionGroup.select(go,false,false);
      vm.selectedGameObject=go;
      // Count respawns at the REAL message boundary: Lua pushes UI updates via
      // window.vext.WebUpdateBatch (resolved by name at call time, so wrapping works). Each
      // re-instantiation sends a SpawnedGameObject CAR for this guid.
      var TARGET=go.guid.toString().toLowerCase();
      window.__churn={respawns:0, edits:0, done:false};
      var origBatch=window.vext.WebUpdateBatch.bind(window.vext);
      window.__origBatch=origBatch;
      window.vext.WebUpdateBatch=function(updates){
        try{
          (updates||[]).forEach(function(u){
            if(u && u.path==='HandleResponse' && u.payload && u.payload.length!==undefined){
              for(var i=0;i<u.payload.length;i++){
                var car=u.payload[i];
                if(car && car.type==='SpawnedGameObject' && car.gameObjectTransferData &&
                   String(car.gameObjectTransferData.guid).toLowerCase()===TARGET){ window.__churn.respawns++; }
              }
            }
          });
        }catch(e){}
        return origBatch(updates);
      };
      var N=10;
      for(var i=0;i<N;i++){
        (function(k){ setTimeout(function(){
          vm.onEBXInput({field:ap.elemField,type:'GameObjectData',
            value:{field:ap.scalar,type:'Float32',value:60+k,oldValue:60+k-1}}, true);
          window.__churn.edits++;
        }, k*30); })(i);
      }
      setTimeout(function(){
        window.vext.WebUpdateBatch=window.__origBatch;   // restore
        window.__churn.done=true;
      }, 4000);
      return JSON.stringify({started:true, edits:N});
    })()""")
    if isinstance(probe, dict) and probe.get("skip"):
        return "SKIP: " + probe["skip"]
    assert isinstance(probe, dict) and probe.get("started"), f"churn probe failed ({probe})"

    res = _poll(addr, "(function(){var c=window.__churn;return JSON.stringify("
                      "c&&c.done?{done:true,edits:c.edits,respawns:c.respawns}:{done:null});})()",
                "done", tries=15)
    assert res is not None, "churn probe never finished"
    edits, respawns = res["edits"], res["respawns"]
    assert respawns > 0, (
        f"probe measured 0 respawns for {edits} edits — the edits never reached the object, so this "
        f"test proves nothing (check the target/inspector wiring)")
    assert respawns < edits, (
        f"NO DEBOUNCE: {edits} rapid edits caused {respawns} respawns (expected far fewer) — "
        f"this is the churn that froze the client")
    return f"{edits} rapid edits -> {respawns} respawn(s)"


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
