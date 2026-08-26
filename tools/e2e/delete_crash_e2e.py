#!/usr/bin/env python3
"""Does deleting a vehicle kill the server, and does an edit beforehand decide it?

Reported 2026-08-26: deleting a spawned vehicle crashes the SERVER natively -- the log simply
stops, no Lua error. The suspicion is our own live-edit path: VehiclePreview swaps a blueprint
field with DatabasePartition:ReplaceInstance, but entities already built reference the OLD
container. Destroying them then walks back to an instance the partition no longer holds.

Two arms, one variable:

    --arm clean  : spawn -> delete.                  No edit ever touches the blueprint.
    --arm edited : spawn -> edit gravity -> delete.  Same delete, after a replacement.

clean surviving while edited dies is the whole proof. Both dying means delete is broken on its
own and ReplaceInstance is exonerated.

Exit 0 = survived, 1 = server died, 2 = could not set up (result unusable).
"""
import argparse, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor          # noqa: E402
from field_safety_e2e import spawn, count, server_alive, client_alive    # noqa: E402

GUID = 'ED170122-7777-0000-0000-DE1E7E000001'


def delete(addr, guid):
    return cdp_eval(addr, """(function(){try{
      window.vext.SendCommand({type:'DeleteGameObjectCommand', sender:'',
        gameObjectTransferData:{guid:%s}});
      return JSON.stringify({sent:true});
    }catch(e){return JSON.stringify({err:''+e});}})()""" % json.dumps(guid))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--arm", choices=["clean", "edited"], required=True)
    ap.add_argument("--blueprint", default="Vehicles/BMP2/BMP2")
    args = ap.parse_args()
    short = args.blueprint.rsplit("/", 1)[-1]

    if not enter_game(args.addr) or not wait_for_editor(args.addr):
        print("SETUP: could not reach the editor"); return 2

    spawn(args.addr, args.blueprint, GUID)
    for _ in range(15):
        time.sleep(2)
        if count(args.addr, short) >= 1:
            break
    else:
        print("SETUP: the spawn never registered — result unusable"); return 2

    if args.arm == "edited":
        # The live-edit path under suspicion: a field replacement on a blueprint that already
        # has entities standing in the world.
        cdp_eval(args.addr, """(function(){window.__rawWrite=null;
            window.vext.SendEvent('RawWrite', %s); return JSON.stringify({sent:true});})()"""
            % json.dumps("%s|components.1.vehicleConfig.gravityModifier|-4.0" % args.blueprint))
        time.sleep(5)
        wrote = cdp_eval(args.addr, "(function(){return JSON.stringify(window.__rawWrite||{none:true});})()")
        if not (isinstance(wrote, dict) and wrote.get("ok") is True):
            print("SETUP: the edit did not land (%s) — result unusable" % json.dumps(wrote)); return 2
        print("  edited: %s -> %s" % (wrote.get("before"), wrote.get("after")), flush=True)
        if not server_alive():
            print("DIED: server died on the EDIT, before any delete"); return 1

    delete(args.addr, GUID)

    for _ in range(10):
        time.sleep(2)
        if not server_alive():
            print("DIED: %s — server died on the DELETE" % args.arm); return 1

    gone = count(args.addr, short) == 0
    print("SURVIVED: %s — server alive after the delete (object removed=%s, client alive=%s)"
          % (args.arm, gone, client_alive(args.addr)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
