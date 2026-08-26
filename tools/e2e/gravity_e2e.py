#!/usr/bin/env python3
"""Does a gravity edit reach the right vehicles, at the right time?

Position is the honest observable: negative gravity makes a vehicle rise, so nobody has to trust a
value read back out of the blueprint. Physics moves the ENTITY, not the editor placement, so the
probe is the replicated AABB the server re-measures for the selection -- it tracks the hull.

  spawn two, let them settle           -> baseline
  set gravity NEGATIVE on ONE of them  -> must change NEITHER (no live update, no leak)
  apply to blueprint                   -> the blueprint changes; standing vehicles may not
  spawn a fresh one                    -> MUST rise (the applied value is in the blueprint)
  undo the apply                       -> blueprint restored
  spawn another                        -> must NOT rise

Exit 0 = every stage behaved, 1 = a stage did not, 2 = setup failed (result unusable).
"""
import json
import sys
import time

sys.path.insert(0, '.')
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor   # noqa: E402
from spawn_spaced import spawn_at                                 # noqa: E402

ADDR = 'localhost:8884'
BP = 'Vehicles/BMP2/BMP2'
SETTLE = 12
RISE_M = 1.5          # a vehicle under negative gravity clears this easily; settling never does


def guids_of_bmp2():
    r = cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values(),o=[];
    for(var i=0;i<v.length;i++){var g=v[i];
     if(g&&g.name&&String(g.name).indexOf("BMP2")!==-1&&(g.gameEntitiesData||[]).length)
       o.push(g.guid.toString());}
    return JSON.stringify({g:o});})()""")
    return r.get('g', []) if isinstance(r, dict) else []


def select(guids):
    cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values(),want=%s,g=[];
    for(var i=0;i<v.length;i++){var o=v[i];
     if(o&&want.indexOf(o.guid.toString())!==-1){o.onSelect();g.push(o.guid.toString());}}
    window.vext.SendEvent('SetSelection', g);
    return JSON.stringify({n:g.length});})()""" % json.dumps(guids))


def heights():
    """Live Y of every BMP2, read on the SERVER from the actual entity.

    The client cannot answer this: it has no handle on a networked vehicle, and the replicated box
    only refreshes while the native viewport draws, which a scripted session never activates. The
    first version of this probe read that stale box and reported the spawn height for everything,
    including vehicles that had long since hit the ground."""
    cdp_eval(ADDR, """(function(){window.__probePos=null;
      window.vext.SendEvent('ProbePositions'); return JSON.stringify({s:1});})()""")
    time.sleep(3)
    r = cdp_eval(ADDR, "(function(){return JSON.stringify(window.__probePos||{});})()")
    return r if isinstance(r, dict) else {}


def set_gravity(guid, value):
    """Same shape the inspector sends: rooted at `object`, printable type on the leaf only."""
    chain = {'field': 'object', 'type': 'GameObjectData', 'value':
             {'field': 'components', 'value':
              {'field': '1', 'value':
               {'field': 'vehicleConfig', 'value':
                {'field': 'gravityModifier', 'type': 'Float32', 'value': value}}}}}
    return cdp_eval(ADDR, """(function(){window.vext.SendCommand({type:'SetEBXFieldCommand',
      sender:'', gameObjectTransferData:{guid:%s, overrides:[%s]}});
      return JSON.stringify({sent:1});})()""" % (json.dumps(guid), json.dumps(chain)))


def send(cmd, guid):
    return cdp_eval(ADDR, """(function(){window.vext.SendCommand({type:%s, sender:'',
      gameObjectTransferData:{guid:%s, overrides:[]}}); return JSON.stringify({sent:1});})()"""
      % (json.dumps(cmd), json.dumps(guid)))


def spawn_and_watch(tag, guid_hex, dx):
    spawn_at(ADDR, BP, 'ED170122-7777-0000-0000-%s' % guid_hex, dx)
    time.sleep(SETTLE)
    g = guids_of_bmp2()
    select(g)
    time.sleep(3)
    h = heights()
    print('   %-22s %s' % (tag, json.dumps(h)), flush=True)
    return h


def main():
    if not enter_game(ADDR) or not wait_for_editor(ADDR):
        print('SETUP: could not reach the editor'); return 2

    print('1. two vehicles, settling')
    spawn_at(ADDR, BP, 'ED170122-7777-0000-0000-6AAB00000001', 0.0)
    time.sleep(4)
    spawn_at(ADDR, BP, 'ED170122-7777-0000-0000-6AAB00000002', 8.0)
    time.sleep(SETTLE)

    g = guids_of_bmp2()
    if len(g) < 2:
        print('SETUP: expected 2 vehicles, got %d' % len(g)); return 2
    select(g)
    time.sleep(3)
    base = heights()
    print('   baseline               %s' % json.dumps(base), flush=True)

    target = g[0]
    print('2. gravity -4 on %s only (no apply)' % target[-6:])
    set_gravity(target, -4.0)
    time.sleep(8)
    select(g); time.sleep(3)
    after_edit = heights()
    print('   after edit             %s' % json.dumps(after_edit), flush=True)

    print('3. apply to blueprint')
    send('ApplyBlueprintOverridesCommand', target)
    time.sleep(8)
    select(guids_of_bmp2()); time.sleep(3)
    after_apply = heights()
    print('   after apply            %s' % json.dumps(after_apply), flush=True)

    after_spawn = spawn_and_watch('fresh spawn (want RISE)', '6AAB00000003', 16.0)

    print('4. undo the apply')
    send('UndoApplyBlueprintOverridesCommand', target)
    time.sleep(8)
    after_undo = spawn_and_watch('post-undo spawn (want NO rise)', '6AAB00000004', 24.0)

    def placements():
        """Where each vehicle was PLACED (the editor transform), which physics never changes."""
        r = cdp_eval(ADDR, """(function(){var e=window.editor,v=e.gameObjects.values(),o={};
        for(var i=0;i<v.length;i++){var g=v[i];
         if(!g||!g.name||String(g.name).indexOf("BMP2")===-1) continue;
         var t=g.transform&&g.transform.trans?g.transform.trans:null;
         if(t) o[String(g.guid).slice(-6)]=Math.round(t.y*100)/100;}
        return JSON.stringify(o);})()""")
        return r if isinstance(r, dict) else {}

    place = placements()

    def rose_above_spawn(live, key):
        """Above where it was dropped = negative gravity. Below = it fell, like a normal vehicle.

        Comparing against the settled GROUND height instead was wrong: a vehicle still on its way
        down reads several metres above the ground and scored as 'risen'."""
        # Coerce: CDP hands values back as strings on some paths, and "a" - "b" raises rather
        # than comparing, which failed the run in the SCORING step after every measurement had
        # already been taken correctly.
        if key not in live or key not in place:
            return False

        try:
            return (float(live[key]) - float(place[key])) > RISE_M
        except (TypeError, ValueError):
            return False

    def risen(before, after, key):
        return key in before and key in after and (after[key] - before[key]) > RISE_M

    print()
    ok = True
    moved = [k for k in base if risen(base, after_edit, k)]
    print('EDIT   : standing vehicles moved: %s %s' % (moved or 'none', '' if not moved else '<-- LEAK/live-update'))
    ok = ok and not moved

    new3 = [k for k in after_spawn if k not in after_apply]
    rose3 = [k for k in new3 if rose_above_spawn(after_spawn, k)]
    print('APPLY  : fresh spawn %s rose: %s' % (new3, bool(rose3)))
    ok = ok and bool(rose3)

    new4 = [k for k in after_undo if k not in after_spawn]
    rose4 = [k for k in new4 if rose_above_spawn(after_undo, k)]
    print('UNDO   : post-undo spawn %s rose: %s (want False)' % (new4, bool(rose4)))
    ok = ok and not rose4

    print('\n%s' % ('PASS' if ok else 'FAIL'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
