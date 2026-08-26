#!/usr/bin/env python3
"""Does editing a vehicle change the vehicle STANDING THERE, not just the next one spawned?

This is the thing that never worked: a per-instance edit reached new spawns only, because the live
entity keeps the container it was built from and re-reads nothing. LIVE_RESPAWN rebuilds the object
from the shared blueprint with the edit written, then restores the blueprint -- so the new entity
carries the edit while later spawns stay stock.

Physics judges it: gravity -4 makes a settled vehicle RISE off the ground.

Exit 0 = the edited vehicle updated live, 1 = it did not, 2 = setup failed.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from apply_sweep_e2e import chain, send                            # noqa: E402
from mapeditor_e2e import fresh_guid, enter_game, wait_for_editor              # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402

RISE_M = 1.5


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    guid_a = fresh_guid(0)
    spawn_at(A.ADDR, A.BP, guid_a, 0.0)
    time.sleep(A.SETTLE + 4)

    g = guid_ending(guid_a[-6:])
    if g is None:
        print('SETUP: the vehicle did not register'); return 2

    before = A.positions()
    if guid_a[-6:] not in before:
        print('SETUP: no position for the vehicle (%s)' % json.dumps(before)); return 2

    y0 = float(before[guid_a[-6:]])
    print('settled at y=%.2f' % y0, flush=True)

    send('SetEBXFieldCommand', g, [chain('components.1.vehicleConfig.gravityModifier', 'Float32', -4.0)])

    best = y0

    for i in range(8):
        time.sleep(5)

        if not server_alive() or not client_alive(A.ADDR):
            print('DIED %ds after the edit (server=%s client=%s)'
                  % ((i + 1) * 5, server_alive(), client_alive(A.ADDR)))
            return 1

        pos = A.positions()
        # The rebuild may re-register under the same guid; take whatever is tracked for it.
        y = float(pos.get(guid_a[-6:], best))
        best = max(best, y)
        print('  t+%02ds y=%.2f (peak %+.2f)' % ((i + 1) * 5, y, best - y0), flush=True)

    print()
    if (best - y0) > RISE_M:
        print('PASS: the edited vehicle rose %+.2fm -- the edit reached the LIVE vehicle' % (best - y0))
        return 0

    print('FAIL: the edited vehicle never rose (peak %+.2fm) -- still new-spawns-only' % (best - y0))
    return 1
if __name__ == "__main__": sys.exit(main())
