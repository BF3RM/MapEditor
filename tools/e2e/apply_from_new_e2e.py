#!/usr/bin/env python3
"""Does "apply to blueprint" still work the SECOND time, from a DIFFERENT instance?

Reported: apply works once, then stops. Two applies with OPPOSITE physics make a stale second
apply unmistakable -- there is no reading of "it fell" that also means "it rose":

    apply #1: gravity -4  -> a vehicle spawned after it RISES above its placement
    apply #2: gravity +6  -> a vehicle spawned after it FALLS hard

If apply #2 is a no-op the third vehicle keeps rising, and that is the bug on the wire.

Positions come from the SERVER: the client holds no handle on a networked vehicle, and the
replicated box only refreshes while the native viewport draws, which a scripted session never
switches on.

Exit 0 = both applies took, 1 = the second did not, 2 = setup failed.
"""
import json
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor   # noqa: E402
from spawn_spaced import spawn_at                                 # noqa: E402

ADDR = 'localhost:8884'
BP = 'Vehicles/BMP2/BMP2'
SETTLE = 12
MARGIN = 1.5


def positions():
    cdp_eval(ADDR, """(function(){window.__probePos=null;
      window.vext.SendEvent('ProbePositions'); return JSON.stringify({s:1});})()""")
    time.sleep(3)
    r = cdp_eval(ADDR, "(function(){return JSON.stringify(window.__probePos||{});})()")
    return r if isinstance(r, dict) else {}


def placements():
    r = cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values(),o={};
    for(var i=0;i<v.length;i++){var g=v[i];
     if(!g||!g.name||String(g.name).indexOf("BMP2")===-1) continue;
     var t=g.transform&&g.transform.trans?g.transform.trans:null;
     if(t) o[String(g.guid).slice(-6)]=Math.round(t.y*100)/100;}
    return JSON.stringify(o);})()""")
    return r if isinstance(r, dict) else {}


def first_guid():
    r = cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values();
    for(var i=0;i<v.length;i++){var g=v[i];
     if(g&&g.name&&String(g.name).indexOf("BMP2")!==-1) return JSON.stringify({g:g.guid.toString()});}
    return JSON.stringify({g:null});})()""")
    return r.get('g') if isinstance(r, dict) else None


def set_gravity(guid, value):
    chain = {'field': 'object', 'type': 'GameObjectData', 'value':
             {'field': 'components', 'value':
              {'field': '1', 'value':
               {'field': 'vehicleConfig', 'value':
                {'field': 'gravityModifier', 'type': 'Float32', 'value': value}}}}}
    cdp_eval(ADDR, """(function(){window.vext.SendCommand({type:'SetEBXFieldCommand', sender:'',
      gameObjectTransferData:{guid:%s, overrides:[%s]}}); return JSON.stringify({s:1});})()"""
      % (json.dumps(guid), json.dumps(chain)))


def apply(guid):
    cdp_eval(ADDR, """(function(){window.vext.SendCommand({type:'ApplyBlueprintOverridesCommand',
      sender:'', gameObjectTransferData:{guid:%s, overrides:[]}}); return JSON.stringify({s:1});})()"""
      % json.dumps(guid))


def spawn_probe(tag, hexid, dx):
    """Measure the vehicle WE just spawned, identified by its guid.

    Picking "the last one by sort order" grabbed 977021 -- the BMP2 that ships with the map -- which
    sits still forever, so both applies looked like no-ops and the run blamed the product for a
    probe bug."""
    spawn_at(ADDR, BP, 'ED170122-7777-0000-0000-%s' % hexid, dx)
    time.sleep(SETTLE)
    key = hexid[-6:]
    live, place = positions(), placements()

    if key not in live or key not in place:
        print('   %-26s %s  MISSING (live=%s place=%s)'
              % (tag, key, key in live, key in place), flush=True)
        return None

    delta = round(live[key] - place[key], 2)
    print('   %-26s %s  (delta vs placement: %s)' % (tag, key, delta), flush=True)
    return delta


def guid_ending(sfx):
    r = cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values();
    for(var i=0;i<v.length;i++){var g=v[i];
     if(g&&g.name&&String(g.name).indexOf("BMP2")!==-1&&g.guid.toString().slice(-6)===%s)
       return JSON.stringify({g:g.guid.toString()});}
    return JSON.stringify({g:null});})()""" % json.dumps(sfx))
    return r.get('g') if isinstance(r, dict) else None


def main():
    if not enter_game(ADDR) or not wait_for_editor(ADDR):
        print('SETUP: could not reach the editor'); return 2

    guid_a = fresh_guid(0)
    spawn_at(ADDR, BP, guid_a, 0.0)
    time.sleep(SETTLE)
    guid_b = fresh_guid(1)
    spawn_at(ADDR, BP, guid_b, 10.0)
    time.sleep(SETTLE)

    g_a, g_b = guid_ending(guid_a[-6:]), guid_ending(guid_b[-6:])

    if g_a is None or g_b is None:
        print('SETUP: vehicles did not register (A=%s B=%s)' % (g_a, g_b)); return 2

    print('apply #1 FROM vehicle A: gravity -4 (expect the next spawn to RISE)')
    set_gravity(g_a, -4.0); time.sleep(6)
    apply(g_a); time.sleep(8)
    d1 = spawn_probe('after apply #1', fresh_guid(10)[-12:], 20.0)

    print('apply #2 FROM vehicle B (a different instance): gravity +6 (expect the next to FALL)')
    set_gravity(g_b, 6.0); time.sleep(6)
    apply(g_b); time.sleep(8)
    d2 = spawn_probe('after apply #2', fresh_guid(11)[-12:], 30.0)

    print()
    ok1 = d1 is not None and d1 > MARGIN
    ok2 = d2 is not None and d2 < -MARGIN
    print('apply #1 (from A) took : %s  [delta %s]' % (ok1, d1))
    print('apply #2 (from B) took : %s  [delta %s]' % (ok2, d2))

    if ok1 and not ok2:
        print('\nFAIL: the second apply, from a DIFFERENT instance, did not reach the blueprint')
        return 1
    if not ok1:
        print('\nSETUP: the first apply did not take; nothing to conclude'); return 2

    print('\nPASS: both applies reached the blueprint')
    return 0


if __name__ == '__main__':
    sys.exit(main())
