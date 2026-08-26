#!/usr/bin/env python3
"""Is writing ONE blueprint field live safe, or does it break the next spawn?

Modifying `vehicleConfig.gravityModifier` on both realms and then spawning another vehicle is safe;
modifying `object.exitDirectionSpeedThreshold` the same way kills the client. Both are Float32 on the
same blueprint. Until we know which fields are which, "live editing crashes vehicles" is
unactionable -- with a list it becomes a rule the editor can enforce.

One field per run, because a fatal one takes the realm with it:

    spawn a vehicle -> raw-write the field on BOTH realms -> spawn another -> did anything die?

Nothing from the editor's edit path is involved (no GameObject, no clone, no overrides), so the
result is about the WRITE alone. Driven by tools/field_safety_sweep.sh, which restarts between runs.

Exit 0 = survived, 1 = something died, 2 = could not set up (result unusable).
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, fresh_guid, wait_for_editor  # noqa: E402

GUIDS = [fresh_guid(0),
         fresh_guid(1)]

# How many spawns must survive before a field is called safe. One is not enough: a single-spawn
# check called gravityModifier SAFE, and it kills the client on the very next spawn when repeated.
SPAWNS_AFTER_WRITE = 4


def server_alive():
    out = subprocess.run(["pgrep", "-f", "serverInstancePath.*-server"],
                         capture_output=True, text=True).stdout.split()
    for pid in out:
        try:
            if open("/proc/%s/comm" % pid).read().strip() not in ("bash", "sh", "dash", "zsh"):
                return True
        except OSError:
            continue
    return False


def client_alive(addr):
    r = cdp_eval(addr, "(function(){return JSON.stringify({ok: !!(window.editor)});})()", timeout=15)
    return isinstance(r, dict) and r.get("ok") is True


def spawn(addr, bp_name, guid):
    js = """(function(){try{
      var e=window.editor, NAME=%s, bp=null;
      var all=e.blueprintManager.blueprints.values();
      for(var i=0;i<all.length;i++){ if(String(all[i].name)===NAME){bp=all[i];break;} }
      if(!bp) return JSON.stringify({err:'blueprint not in browser'});
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


def count(addr, short):
    r = cdp_eval(addr, """(function(){
      var e=window.editor, vals=e.gameObjects.values(), n=0;
      for(var i=0;i<vals.length;i++){ if(vals[i]&&vals[i].name&&vals[i].name.indexOf(%s)!==-1) n++; }
      return JSON.stringify({n:n});})()""" % json.dumps(short))
    return r.get("n", 0) if isinstance(r, dict) else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--blueprint", default="Vehicles/BMP2/BMP2")
    ap.add_argument("--field", required=True,
                    help="path under the blueprint's `object`, e.g. "
                         "'upsideDownDamage' or 'components.1.vehicleConfig.gravityModifier'")
    ap.add_argument("--value", default="-4.0")
    args = ap.parse_args()
    short = args.blueprint.rsplit("/", 1)[-1]

    if not enter_game(args.addr) or not wait_for_editor(args.addr):
        print("SETUP: could not reach the editor"); return 2

    # 1. a vehicle exists before the write
    if not (isinstance(spawn(args.addr, args.blueprint, GUIDS[0]), dict)):
        print("SETUP: spawn 1 rejected"); return 2
    for _ in range(15):
        time.sleep(2)
        if not client_alive(args.addr):
            print("SETUP: died on the first spawn, before any write"); return 2
        if count(args.addr, short) >= 1:
            break
    else:
        print("SETUP: spawn 1 never registered"); return 2

    # 2. the write, on both realms
    payload = "%s|%s|%s" % (args.blueprint, args.field, args.value)
    cdp_eval(args.addr, """(function(){window.__rawWrite=null;
                            window.vext.SendEvent('RawWrite', %s);
                            return JSON.stringify({sent:true});})()""" % json.dumps(payload))
    time.sleep(5)

    # The write must have LANDED. A failed write makes the rest of this run meaningless -- it once
    # reported a fatal field as SAFE purely because nothing had been written.
    wrote = cdp_eval(args.addr, "(function(){return JSON.stringify(window.__rawWrite||{none:true});})()")
    if not (isinstance(wrote, dict) and wrote.get("ok") is True):
        print("SETUP: the write did not land for %s (%s) — result unusable"
              % (args.field, json.dumps(wrote)))
        return 2
    print("  wrote %s: %s -> %s" % (wrote.get("path"), wrote.get("before"), wrote.get("after")),
          flush=True)

    if not client_alive(args.addr):
        print("DIED: %s — on the WRITE itself (%s)"
              % (args.field, "client" if server_alive() else "server"))
        return 1

    # 3. spawn REPEATEDLY. One surviving spawn means nothing: these crashes take one to three, so a
    #    single-spawn check reported fatal fields (gravityModifier among them) as SAFE.
    prev = count(args.addr, short)

    for attempt in range(1, SPAWNS_AFTER_WRITE + 1):
        spawn(args.addr, args.blueprint, "ED170122-7777-0000-0000-4000000000%02X" % attempt)
        got = prev

        for _ in range(12):
            time.sleep(2)
            if not client_alive(args.addr):
                print("DIED: %s — on spawn %d after the write (%s)"
                      % (args.field, attempt, "client" if server_alive() else "server"))
                return 1
            got = count(args.addr, short)
            if got > prev:
                break

        if got <= prev:
            print("SETUP: spawn %d never registered — result unusable" % attempt)
            return 2

        prev = got

    print("SAFE: %s — wrote on both realms and survived %d spawns"
          % (args.field, SPAWNS_AFTER_WRITE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
