#!/usr/bin/env python3
"""Repro for GH #389 — editing an EBX field on a weapon hard-crashes the server.

Deliberately NOT part of mapeditor_e2e.py: it is expected to take the server down, so it must
never run as part of the normal suite.

What it does
------------
1. Enters the game (soldier click + DEV_AUTO_ENTER_EDITOR), reusing the harness helpers.
2. Spawns a SoldierWeaponBlueprint, so the target is deterministic rather than "whatever the user
   happened to click".
3. Selects it and edits one scalar EBX field through the real inspector path.
4. Watches the server for death, and reports the failure mode: native (process gone, no Lua error)
   vs a Lua traceback.

Usage:  python3 repro_weapon_crash.py [--addr localhost:8884]
Exit 0 = crash reproduced, 1 = survived, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor  # noqa: E402

SERVER_LOG = os.environ.get(
    "VU_SERVER_LOG", "/home/powos/Games/VeniceUnleashed/instance/logs/server.log")


def server_alive():
    try:
        out = subprocess.run(["pgrep", "-af", r"vu\.com"], capture_output=True, text=True).stdout
    except Exception:
        return False
    return any("server -dedicated" in ln for ln in out.splitlines())


def log_size():
    try:
        return os.path.getsize(SERVER_LOG)
    except OSError:
        return 0


def log_since(offset):
    try:
        with open(SERVER_LOG, "rb") as f:
            f.seek(offset)
            return f.read().decode("utf-8", "replace")
    except OSError:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default=os.environ.get("VU_CDP_ADDR", "localhost:8884"))
    ap.add_argument("--type", default="SoldierWeaponBlueprint",
                    help="blueprint typeName to target (default: SoldierWeaponBlueprint)")
    args = ap.parse_args()

    if not server_alive():
        print("[repro] FATAL: server is not running")
        return 2

    print(f"[repro] entering game on {args.addr}…")
    if not enter_game(args.addr):
        print("[repro] FATAL: could not reach the editor")
        return 2
    ready = wait_for_editor(args.addr)
    if not (isinstance(ready, dict) and ready.get("ready")):
        print(f"[repro] FATAL: editor never initialised: {ready}")
        return 2
    print(f"[repro] editor ready — {ready.get('count')} objects")

    # 1. Spawn a weapon so the target is deterministic.
    spawn = cdp_eval(args.addr, """(function(){
      var e=window.editor, all=e.blueprintManager.blueprints.values(), bp=null;
      for(var i=0;i<all.length;i++){ if(all[i].typeName==='""" + args.type + """'){ bp=all[i]; break; } }
      if(!bp) return JSON.stringify({err:'no blueprint of that type'});
      var before=e.gameObjects.size();
      e.SpawnBlueprint(bp);
      return JSON.stringify({bp:bp.name, before:before});
    })()""")
    if not (isinstance(spawn, dict) and spawn.get("bp")):
        print(f"[repro] FATAL: could not spawn a {args.type} ({spawn})")
        return 2
    print(f"[repro] spawned {spawn['bp']}")
    time.sleep(4)

    if not server_alive():
        print("[repro] CRASH on SPAWN (before any edit) — the spawn alone kills it")
        return 0

    # 2. Find the spawned object and an editable scalar on its blueprint.
    setup = cdp_eval(args.addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values(), go=null;
      for(var i=vals.length-1;i>=0;i--){ if(vals[i].name && vals[i].name.toLowerCase()==='""" + spawn["bp"].lower() + """'){ go=vals[i]; break; } }
      if(!go) return JSON.stringify({err:'spawned object not found in the tree'});
      window.__w={go:go};
      e.selectionGroup.select(go,false,false);
      var insp=document.querySelector('.inspector-component'), vm=insp&&insp.__vue__;
      if(!vm) return JSON.stringify({err:'no inspector vm'});
      window.__w.vm=vm; vm.selectedGameObject=go;
      window.__w.field=null;
      go.partition.then(function(part){
        var pi=part.primaryInstance;
        if(!pi){ window.__w.field={err:'no primaryInstance'}; return; }
        // top-level scalar on the blueprint's object/objects
        var f=pi.fields.object || pi.fields.objects;
        window.__w.field={ok:true, partName:part.name, top:f?f.name:null,
                          fieldNames:Object.keys(pi.fields).slice(0,12)};
      }).catch(function(err){ window.__w.field={err:String(err)}; });
      return JSON.stringify({selected:go.name, guid:go.guid.toString()});
    })()""")
    if not (isinstance(setup, dict) and setup.get("selected")):
        print(f"[repro] FATAL: setup failed ({setup})")
        return 2
    print(f"[repro] selected {setup['selected']}")
    time.sleep(4)

    info = cdp_eval(args.addr, "(function(){return JSON.stringify(window.__w && window.__w.field);})()")
    print(f"[repro] blueprint partition: {info}")

    # 3. Edit it. This is the action that is expected to kill the server.
    offset = log_size()
    print("[repro] sending the EBX edit…")
    edit = cdp_eval(args.addr, """(function(){
      var w=window.__w;
      if(!w||!w.vm) return JSON.stringify({err:'no vm'});
      // Same shape the inspector emits: objects[<idx>].<scalar>. We don't know the weapon's
      // layout, so drive the generic 'object' path with a harmless float; DeepClone runs BEFORE
      // the field write, which is the point — the crash is in the clone, not the assignment.
      w.vm.onEBXInput({field:'1', type:'GameObjectData',
        value:{field:'radius', type:'Float32', value:1.0, oldValue:0.0}}, true);
      return JSON.stringify({sent:true});
    })()""")
    print(f"[repro] edit dispatched: {edit}")

    for i in range(15):
        time.sleep(2)
        if not server_alive():
            tail = log_since(offset)
            lua_error = "Error:" in tail or "stack traceback" in tail
            print(f"\n[repro] *** SERVER DIED after ~{(i+1)*2}s ***")
            print(f"[repro] failure mode: {'LUA ERROR (recoverable in principle)' if lua_error else 'NATIVE CRASH (no Lua traceback)'}")
            print("[repro] server log tail:")
            for ln in tail.strip().splitlines()[-12:]:
                print("   " + ln)
            return 0

    print("\n[repro] server SURVIVED the edit — not reproduced with this target/field")
    print("[repro] log tail since the edit:")
    for ln in log_since(offset).strip().splitlines()[-8:]:
        print("   " + ln)
    return 1


if __name__ == "__main__":
    sys.exit(main())
