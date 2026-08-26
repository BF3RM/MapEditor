#!/usr/bin/env python3
"""Spawn and delete a vehicle repeatedly. Does memory hold?

Reported: "took me like 2 sec to crash the thing spawning random stuff", and the server log said
"Your game has run out of memory" (exit 8). The recorded session ends in exactly this: spawn a
BMP2, delete it, spawn, delete.

A vehicle's entities cannot be freed (destroying them is a native crash, and deferring the free
does not help either -- measured), so delete only DISABLES them. That leaks an entity bus per
cycle, and this measures how many cycles that survives.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402

CYCLES = 15


def delete(guid):
    cdp_eval(A.ADDR, """(function(){window.vext.SendCommand({type:'DeleteGameObjectCommand',
      sender:'', gameObjectTransferData:{guid:%s}}); return JSON.stringify({s:1});})()"""
      % json.dumps(guid))


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    for i in range(1, CYCLES + 1):
        guid = 'ED170122-7777-0000-0000-1000%08d' % i
        spawn_at(A.ADDR, A.BP, guid, 0.0)
        time.sleep(4)

        if not server_alive() or not client_alive(A.ADDR):
            print('DIED on SPAWN of cycle %d (server=%s client=%s)'
                  % (i, server_alive(), client_alive(A.ADDR)))
            return 1

        delete(guid)
        time.sleep(3)

        s, c = server_alive(), client_alive(A.ADDR)
        print('  cycle %2d  server=%s client=%s' % (i, s, c), flush=True)

        if not s or not c:
            print('DIED on DELETE of cycle %d' % i)
            return 1

    print('\nSURVIVED %d spawn/delete cycles' % CYCLES)
    return 0


if __name__ == '__main__':
    sys.exit(main())
