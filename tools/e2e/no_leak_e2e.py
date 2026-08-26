#!/usr/bin/env python3
"""An edit WITHOUT apply must not reach the next vehicle you spawn.

Reported: spawn a BMP2, change gravity, do NOT press apply, spawn another -- the new one has the
change. Cause found in DataContainerExt: `components` has no elementType, so its members were left
SHARED with the stock blueprint, and gravity lives beneath one of them
(components.1.vehicleConfig.gravityModifier). The "per-instance" edit wrote the blueprint.

Physics is the judge: negative gravity rises, stock falls.

    vehicle A: gravity -4, no apply   -> A may or may not change (no live update for vehicles)
    vehicle B: spawned after          -> MUST fall like stock

Exit 0 = no leak, 1 = the edit leaked to the new spawn, 2 = setup failed.
"""
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from mapeditor_e2e import enter_game, wait_for_editor              # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    spawn_at(A.ADDR, A.BP, 'ED170122-7777-0000-0000-CAAB00000001', 0.0)
    time.sleep(A.SETTLE)

    g = guid_ending('000001')
    if g is None:
        print('SETUP: vehicle A did not register'); return 2

    print('edit gravity -4 on vehicle A, NO apply')
    A.set_gravity(g, -4.0)
    time.sleep(6)

    d = A.spawn_probe('vehicle B (want it to FALL)', 'CAAB00000002', 12.0)

    if d is None:
        print('SETUP: vehicle B did not register'); return 2

    print()
    if d > A.MARGIN:
        print('FAIL: vehicle B rose (%s) -- the unapplied edit leaked into the new spawn' % d)
        return 1

    print('PASS: vehicle B fell (%s) -- the edit stayed on its own instance' % d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
