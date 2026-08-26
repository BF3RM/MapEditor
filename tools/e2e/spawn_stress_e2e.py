#!/usr/bin/env python3
"""How many vehicle spawns does the client survive?

The oldest bug in this session: spawning vehicles kills the client after a few. Every attempt to
pin it has been anecdotal ("it died on the third one"), which cannot tell a fix from luck. This
spawns up to MAX and reports the ordinal that killed a realm, so the number can be compared across
builds instead of remembered.

Prints one line per spawn, so a run that dies still says how far it got.

    tools/e2e/spawn_stress_e2e.py [--max 8] [--select]

--select also selects each vehicle after spawning it, which is what a user does and what the
reported crashes involved.

Exit 0 = survived MAX spawns, 1 = a realm died, 2 = setup failed.
"""
import argparse
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, fresh_guid   # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max', type=int, default=8)
    ap.add_argument('--select', action='store_true')
    args = ap.parse_args()

    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    for i in range(args.max):
        guid = fresh_guid(i)
        spawn_at(A.ADDR, A.BP, guid, i * 8.0)
        time.sleep(8)

        s, c = server_alive(), client_alive(A.ADDR)
        if not s or not c:
            print('spawn %d/%d: DIED (server=%s client=%s)' % (i + 1, args.max, s, c))
            return 1

        if args.select:
            cdp_eval(A.ADDR, """(function(){var e=window.editor,v=e.gameObjects.values();
              for(var j=0;j<v.length;j++){var o=v[j];
               if(o&&o.guid&&o.guid.toString()===%s){ e.DeselectAll(); o.onSelect();
                 window.vext.SendEvent('SetSelection',[o.guid.toString()]); break;}}
              return JSON.stringify({s:1});})()""" % json.dumps(guid), timeout=15)
            time.sleep(4)

            s, c = server_alive(), client_alive(A.ADDR)
            if not s or not c:
                print('spawn %d/%d: DIED on SELECT (server=%s client=%s)' % (i + 1, args.max, s, c))
                return 1

        print('spawn %d/%d: ok' % (i + 1, args.max), flush=True)

    print('\nSURVIVED %d spawns%s' % (args.max, ' with select' if args.select else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
