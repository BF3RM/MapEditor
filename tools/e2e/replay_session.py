#!/usr/bin/env python3
"""Replay a recorded session and report which command killed the realm.

    tools/e2e/replay_session.py session.jsonl

Sends the recorded commands/events in their original order, preserving the gaps between them (a
crash that depends on timing is still a crash worth reproducing), and checks BOTH realms after each
one. The first entry after which a realm stops answering is the suspect, printed with its payload.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor   # noqa: E402
from field_safety_e2e import server_alive, client_alive           # noqa: E402

MAX_GAP = 3.0   # don't replay a coffee break


def send(addr, entry):
    if entry.get('kind') == 'cmd':
        js = "(function(){try{window.vext.SendCommand(%s);return JSON.stringify({s:1});}" \
             "catch(e){return JSON.stringify({err:''+e});}})()" % json.dumps(entry['payload'])
    else:
        js = "(function(){try{window.vext.SendEvent(%s,%s);return JSON.stringify({s:1});}" \
             "catch(e){return JSON.stringify({err:''+e});}})()" % (
                 json.dumps(entry.get('name')), json.dumps(entry.get('arg')))
    return cdp_eval(addr, js, timeout=15)


def describe(entry):
    if entry.get('kind') == 'cmd':
        p = entry.get('payload') or {}
        t = p.get('type') or p.get('_type') or '?'
        g = ''
        try:
            g = ' guid=%s' % str(p['gameObjectTransferData']['guid'])[-6:]
        except Exception:
            pass
        return 'cmd %s%s' % (t, g)
    return 'evt %s' % entry.get('name')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--addr', default='localhost:8884')
    ap.add_argument('--from', dest='start', type=int, default=0)
    args = ap.parse_args()

    entries = [json.loads(l) for l in open(args.file) if l.strip()]
    print('%d entries' % len(entries))

    if not enter_game(args.addr) or not wait_for_editor(args.addr):
        print('SETUP: could not reach the editor'); return 2

    prev_t = None

    for i, e in enumerate(entries):
        if i < args.start:
            continue

        if prev_t is not None:
            time.sleep(min(max((e.get('t', 0) - prev_t) / 1000.0, 0.05), MAX_GAP))
        prev_t = e.get('t', 0)

        r = send(args.addr, e)
        print('%4d  %-46s %s' % (i, describe(e), json.dumps(r)), flush=True)

        s, c = server_alive(), client_alive(args.addr)

        if not s or not c:
            print('\nDIED after entry %d: %s' % (i, describe(e)))
            print('  server=%s client=%s' % (s, c))
            print('  payload: %s' % json.dumps(e)[:600])
            return 1

    print('\nSURVIVED the whole replay')
    return 0


if __name__ == '__main__':
    sys.exit(main())
