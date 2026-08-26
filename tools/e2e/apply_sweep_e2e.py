#!/usr/bin/env python3
"""Apply field after field and report the first one that kills a realm.

The root-object guard should make top-level fields survivable (refused, not swapped) while nested
fields still apply. This walks a mix of both -- including the two that actually killed the client in
recorded sessions -- and checks BOTH realms after every apply, so a death is attributed to one field
rather than to "somewhere in the session".

Runs in ONE session on purpose: the first death ends the sweep and names its field, which is the
information wanted. Fields after it are reported as not-reached rather than as passes.
"""
import json
import sys
import time

sys.path.insert(0, '.')
import apply_twice_e2e as A                                        # noqa: E402
from apply_from_new_e2e import guid_ending                         # noqa: E402
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor    # noqa: E402
from spawn_spaced import spawn_at                                  # noqa: E402
from field_safety_e2e import server_alive, client_alive            # noqa: E402

# (path under `object`, declared type, value). Top-level ones are the recorded killers.
FIELDS = [
    ('exitAllowed',                          'Boolean', False),   # killed the client (recorded)
    ('upsideDownDamage',                     'Float32', 0.0),     # killed the client (recorded)
    ('foregroundRenderCockpitMesh',          'Boolean', False),   # killed the client (recorded)
    ('exitDirectionSpeedThreshold',          'Float32', 5.0),     # FATAL in the old sweep
    ('armorMultiplier',                      'Float32', 2.0),     # FATAL in the old sweep
    ('regenerationDelay',                    'Float32', 3.0),     # FATAL in the old sweep
    ('mesh.lodScale',                        'Float32', 5.0),     # nested, render-side
    ('components.1.vehicleConfig.gravityModifier',        'Float32', -2.0),  # nested, known good
    ('components.1.vehicleConfig.bodyMass',               'Float32', 9000.0),
    ('components.1.vehicleConfig.standStillLowSpeedTimeLimit', 'Float32', 2.0),
]


def chain(path, typ, val):
    node = {'field': 'object', 'type': 'GameObjectData', 'value': None}
    cur = node
    parts = path.split('.')

    for i, part in enumerate(parts):
        leaf = (i == len(parts) - 1)
        nxt = {'field': part, 'value': val if leaf else None}

        if leaf:
            nxt['type'] = typ

        cur['value'] = nxt
        cur = nxt

    return node


def send(cmd, guid, overrides):
    return cdp_eval(A.ADDR, """(function(){window.vext.SendCommand({type:%s, sender:'',
      gameObjectTransferData:{guid:%s, overrides:%s}}); return JSON.stringify({s:1});})()"""
      % (json.dumps(cmd), json.dumps(guid), json.dumps(overrides)))


def main():
    if not enter_game(A.ADDR) or not wait_for_editor(A.ADDR):
        print('SETUP: could not reach the editor'); return 2

    spawn_at(A.ADDR, A.BP, 'ED170122-7777-0000-0000-5EEB00000001', 0.0)
    time.sleep(A.SETTLE)

    g = guid_ending('000001')
    if g is None:
        print('SETUP: the vehicle did not register'); return 2

    dead_at = None

    for path, typ, val in FIELDS:
        if dead_at is not None:
            print('  %-46s not reached' % path)
            continue

        ov = [chain(path, typ, val)]
        send('SetEBXFieldCommand', g, ov)
        time.sleep(3)

        if not client_alive(A.ADDR) or not server_alive():
            dead_at = '%s (on the EDIT)' % path
            print('  %-46s KILLED A REALM on the edit' % path)
            continue

        send('ApplyBlueprintOverridesCommand', g, [])
        time.sleep(5)

        s, c = server_alive(), client_alive(A.ADDR)

        if not s or not c:
            dead_at = '%s (on APPLY, server=%s client=%s)' % (path, s, c)
            print('  %-46s KILLED A REALM on apply (server=%s client=%s)' % (path, s, c))
            continue

        print('  %-46s survived' % path)

    print()

    if dead_at:
        print('FAIL: %s' % dead_at)
        return 1

    print('PASS: every field applied with both realms alive')
    return 0


if __name__ == '__main__':
    sys.exit(main())
