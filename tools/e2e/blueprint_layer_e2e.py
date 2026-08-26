#!/usr/bin/env python3
"""After apply, is the value still VISIBLE as a blueprint-layer override?

The complaint behind this: apply deleted the instance's override and showed nothing in its place,
so the change looked reverted and a second apply looked like a no-op. The value should survive as
an APPLIED override -- shared by every instance of the blueprint, and revertible to vanilla.

  edit gravity on a vehicle          -> personal override on that instance
  apply                              -> moves to the BLUEPRINT layer
  spawn a fresh instance             -> shows the blueprint override too (it inherits it)

Exit 0 = the layer is visible on both instances, 1 = it is not, 2 = setup failed.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402

PROBE = """(function(){var e=window.editor,v=e.gameObjects.values(),o=[];
for(var i=0;i<v.length;i++){var g=v[i];
 if(!g||!g.name||String(g.name).indexOf("BMP2")===-1) continue;
 o.push({guid:String(g.guid).slice(-6),
   personal:Object.keys(g.overrides||{}).length,
   blueprint:Object.keys(g.blueprintOverrides||{}).length,
   bpKeys:Object.keys(g.blueprintOverrides||{})});}
return JSON.stringify({objs:o});})()"""


def probe(tag):
    r = cdp_eval(A.ADDR, PROBE)
    print('   %-18s %s' % (tag, json.dumps(r)), flush=True)
    return r.get('objs', []) if isinstance(r, dict) else []


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    guid_a = fresh_guid(0)
    spawn_at(A.ADDR, A.BP, guid_a, 0.0)
    time.sleep(12)

    g = guid_ending(guid_a[-6:])
    if g is None:
        print('SETUP: the vehicle did not register'); return 2

    A.set_gravity(g, -4.0)
    time.sleep(6)
    probe('after edit')

    A.apply(g)
    time.sleep(8)
    after_apply = probe('after apply')

    guid_b = fresh_guid(1)
    spawn_at(A.ADDR, A.BP, guid_b, 12.0)
    time.sleep(12)
    after_spawn = probe('after new spawn')

    edited = [o for o in after_apply if o['guid'] == guid_a[-6:]]
    fresh = [o for o in after_spawn if o['guid'] == guid_b[-6:]]

    ok_edited = bool(edited) and edited[0]['blueprint'] > 0
    ok_fresh = bool(fresh) and fresh[0]['blueprint'] > 0

    print()
    print('applied-to instance shows the blueprint layer : %s' % ok_edited)
    print('fresh instance inherits the blueprint layer   : %s' % ok_fresh)

    if ok_edited and ok_fresh:
        print('\nPASS: the applied value stays visible as a blueprint override')
        return 0

    print('\nFAIL: the applied value is invisible after apply (the reported bug)')
    return 1


if __name__ == '__main__':
    sys.exit(main())
