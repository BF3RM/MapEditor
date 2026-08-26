#!/usr/bin/env python3
"""Does a DELETED (disabled) vehicle still collide?

Deleting a vehicle disables its entities rather than freeing them -- freeing a networked vehicle
entity is a native crash that takes the server down. Disabled means invisible, but invisible is not
the same as intangible, and the whole live-respawn design (rebuild an edited vehicle instead of
refreshing it) leaves one disabled hull behind per edit. If those hulls still collide, editing a
vehicle a few times builds an invisible wall where you were working -- worse than the bug it fixes.

    spawn A, let it settle          -> ground height
    delete A (disable)
    spawn B at the SAME spot        -> settles to the same height?  or perches on A?

Exit 0 = no ghost collision, 1 = the hull still collides, 2 = setup failed.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from mapeditor_e2e import fresh_guid, cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402

# A BMP2 is ~2.7m tall; perching on one reads as at least a metre of difference.
PERCH_M = 1.0


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    guid_a = fresh_guid(0)
    spawn_at(A.ADDR, A.BP, guid_a, 0.0)
    time.sleep(A.SETTLE + 4)

    g_a = guid_ending(guid_a[-6:])
    if g_a is None:
        print('SETUP: vehicle A did not register'); return 2

    pos = A.positions()
    if guid_a[-6:] not in pos:
        print('SETUP: no position for A (%s)' % json.dumps(pos)); return 2

    y_a = float(pos[guid_a[-6:]])
    print('A settled at y=%.2f' % y_a, flush=True)

    cdp_eval(A.ADDR, """(function(){window.vext.SendCommand({type:'DeleteGameObjectCommand',
      sender:'', gameObjectTransferData:{guid:%s}}); return JSON.stringify({s:1});})()"""
      % json.dumps(g_a))
    time.sleep(8)
    print('A deleted (its entities are DISABLED, not freed)', flush=True)

    # Same spot, so B lands exactly where A's hull would be.
    guid_b = fresh_guid(1)
    spawn_at(A.ADDR, A.BP, guid_b, 0.0)
    time.sleep(A.SETTLE + 4)

    pos = A.positions()
    if guid_b[-6:] not in pos:
        print('SETUP: no position for B (%s)' % json.dumps(pos)); return 2

    y_b = float(pos[guid_b[-6:]])
    print('B settled at y=%.2f  (A was %.2f, delta %+.2f)' % (y_b, y_a, y_b - y_a), flush=True)

    print()
    if (y_b - y_a) > PERCH_M:
        print('FAIL: B rests %.2fm above A -- the disabled hull STILL COLLIDES' % (y_b - y_a))
        print('      live-respawn would stack an invisible hull per edit')
        return 1

    print('PASS: B settled to the same height -- a disabled hull does not collide')
    return 0


if __name__ == '__main__':
    sys.exit(main())
