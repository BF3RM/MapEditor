#!/usr/bin/env python3
"""Apply, then do the things that killed realms earlier today: spawn, duplicate, delete, undo.

The apply sweep proved the applies themselves survive. Every crash reported today, though, came
from what happened AFTER a write -- a spawn built from a written blueprint, a duplicate of a
modified instance, a delete of a vehicle. This chains them and names the step that dies.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from apply_sweep_e2e import chain, send                            # noqa: E402
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402


def alive(tag):
    s, c = server_alive(), client_alive(A.ADDR)
    print('   %-38s server=%s client=%s' % (tag, s, c), flush=True)
    return s and c


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    spawn_at(A.ADDR, A.BP, 'ED170122-7777-0000-0000-57E550000001', 0.0)
    time.sleep(A.SETTLE)
    g = guid_ending('000001') or guid_ending('000001')

    if g is None:
        print('SETUP: vehicle did not register'); return 2

    steps = []

    # 1. a top-level field (the recorded killer) + apply
    send('SetEBXFieldCommand', g, [chain('exitAllowed', 'Boolean', False)])
    time.sleep(4)
    steps.append(('edit top-level field', alive('after edit')))

    send('ApplyBlueprintOverridesCommand', g, [])
    time.sleep(6)
    steps.append(('apply', alive('after apply')))

    # 2. spawn AFTER the apply -- the earlier server-killer
    spawn_at(A.ADDR, A.BP, 'ED170122-7777-0000-0000-57E550000002', 12.0)
    time.sleep(A.SETTLE)
    steps.append(('spawn after apply', alive('after spawn')))

    # 3. edit again, then duplicate the modified instance
    send('SetEBXFieldCommand', g, [chain('components.1.vehicleConfig.gravityModifier', 'Float32', -3.0)])
    time.sleep(4)
    cdp_eval(A.ADDR, """(function(){try{var e=window.editor,v=e.gameObjects.values(),o=null;
      for(var i=0;i<v.length;i++){ if(v[i]&&v[i].guid.toString()===%s){o=v[i];break;} }
      if(!o) return JSON.stringify({err:'gone'});
      e.DeselectAll(); o.onSelect();
      window.vext.SendEvent('SetSelection',[o.guid.toString()]);
      e.Duplicate(); return JSON.stringify({s:1});}catch(err){return JSON.stringify({err:''+err});}})()"""
      % json.dumps(g))
    time.sleep(10)
    steps.append(('duplicate modified instance', alive('after duplicate')))

    # 4. undo the apply
    send('UndoApplyBlueprintOverridesCommand', g, [])
    time.sleep(6)
    steps.append(('undo apply', alive('after undo')))

    # 5. delete the vehicle
    cdp_eval(A.ADDR, """(function(){window.vext.SendCommand({type:'DeleteGameObjectCommand',
      sender:'', gameObjectTransferData:{guid:%s}}); return JSON.stringify({s:1});})()""" % json.dumps(g))
    time.sleep(8)
    steps.append(('delete edited vehicle', alive('after delete')))

    print()
    bad = [name for name, ok in steps if not ok]

    for name, ok in steps:
        print('  %-32s %s' % (name, 'ok' if ok else 'DIED'))

    if bad:
        print('\nFAIL: died at %s' % bad[0])
        return 1

    print('\nPASS: survived edit -> apply -> spawn -> duplicate -> undo -> delete')
    return 0


if __name__ == '__main__':
    sys.exit(main())
