#!/usr/bin/env python3
"""Does duplicating a MODIFIED (unapplied) object kill a realm?

Reported: spawn a BMP2, change gravity, do NOT apply, duplicate it -> crash.

Duplicate is Copy+Paste (Editor.ts), so it re-spawns from whatever the source instance is carrying
-- which, after an edit, is a per-instance clone whose containers have been written. Spawning from
a written clone is the known realm-killer, so this drives the exact sequence and reports WHICH
realm went, since the two have very different causes.

Exit 0 = survived, 1 = a realm died, 2 = setup failed.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402


def duplicate(guid):
    return cdp_eval(A.ADDR, """(function(){try{
      var e=window.editor, v=e.gameObjects.values(), o=null;
      for(var i=0;i<v.length;i++){ if(v[i]&&v[i].guid.toString()===%s){o=v[i];break;} }
      if(!o) return JSON.stringify({err:'object not found'});
      e.DeselectAll();
      o.onSelect();
      if(e.selectionGroup && e.selectionGroup.selectGameObject) e.selectionGroup.selectGameObject(o);
      window.vext.SendEvent('SetSelection', [o.guid.toString()]);
      e.Duplicate();
      return JSON.stringify({sent:true});
    }catch(err){return JSON.stringify({err:''+err});}})()""" % json.dumps(guid))


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    guid_a = fresh_guid(0)
    spawn_at(A.ADDR, A.BP, guid_a, 0.0)
    time.sleep(A.SETTLE)

    g = guid_ending(guid_a[-6:])
    if g is None:
        print('SETUP: the vehicle did not register'); return 2

    print('edit gravity -4, NO apply')
    A.set_gravity(g, -4.0)
    time.sleep(6)

    if not client_alive(A.ADDR):
        print('DIED: client died on the EDIT, before any duplicate'); return 1

    print('duplicate the modified object')
    print('   ->', json.dumps(duplicate(g)), flush=True)

    for i in range(12):
        time.sleep(2)
        s, c = server_alive(), client_alive(A.ADDR)

        if not s or not c:
            print('DIED: %s died %ds after duplicate (server=%s client=%s)'
                  % ('server' if not s else 'client', (i + 1) * 2, s, c))
            return 1

    n = cdp_eval(A.ADDR, """(function(){var e=window.editor,v=e.gameObjects.values(),n=0;
    for(var i=0;i<v.length;i++){ if(v[i]&&v[i].name&&String(v[i].name).indexOf("BMP2")!==-1) n++; }
    return JSON.stringify({n:n});})()""")
    print('\nSURVIVED: both realms alive, BMP2 count now %s' % json.dumps(n))
    return 0


if __name__ == '__main__':
    sys.exit(main())
