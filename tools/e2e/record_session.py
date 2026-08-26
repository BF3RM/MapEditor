#!/usr/bin/env python3
"""Record everything the editor sends, so a crash can be replayed instead of described.

Every editor action reaches the ext through window.vext.SendCommand / SendEvent. This wraps both
over CDP -- no rebuild, no restart, nothing added to product code -- and streams them to a JSONL
file so the record SURVIVES the client dying, which is the whole point: the interesting sequence is
the one that ends in a crash.

    tools/e2e/record_session.py                 # records until you stop it
    tools/e2e/record_session.py --out foo.jsonl

Then reproduce the crash by hand. Afterwards, replay_session.py re-sends the sequence and reports
which command took the realm down.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval   # noqa: E402

INSTALL = """(function(){
  if (window.__rec) { return JSON.stringify({already:true, n:window.__rec.log.length}); }
  window.__rec = { log: [], t0: Date.now() };
  var v = window.vext;
  if (!v) { return JSON.stringify({err:'no window.vext'}); }
  var origCmd = v.SendCommand ? v.SendCommand.bind(v) : null;
  var origEvt = v.SendEvent ? v.SendEvent.bind(v) : null;
  if (origCmd) {
    v.SendCommand = function(c){
      try { window.__rec.log.push({t: Date.now()-window.__rec.t0, kind:'cmd', payload: c}); } catch(e){}
      return origCmd(c);
    };
  }
  if (origEvt) {
    v.SendEvent = function(name, arg){
      try { window.__rec.log.push({t: Date.now()-window.__rec.t0, kind:'evt', name: name, arg: arg}); } catch(e){}
      return origEvt(name, arg);
    };
  }
  return JSON.stringify({installed:true});
})()"""

DRAIN = """(function(){
  if (!window.__rec) { return JSON.stringify({gone:true}); }
  var out = window.__rec.log.splice(0, window.__rec.log.length);
  return JSON.stringify({batch: out});
})()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--addr', default='localhost:8884')
    ap.add_argument('--out', default='session.jsonl')
    ap.add_argument('--interval', type=float, default=1.0)
    args = ap.parse_args()

    r = cdp_eval(args.addr, INSTALL)
    print('hook: %s' % json.dumps(r), flush=True)

    if isinstance(r, dict) and r.get('err'):
        return 2

    n = 0
    print('recording -> %s   (reproduce the crash now; Ctrl-C or kill to stop)' % args.out, flush=True)

    with open(args.out, 'a') as fh:
        while True:
            time.sleep(args.interval)
            d = cdp_eval(args.addr, DRAIN, timeout=8)

            if not isinstance(d, dict):
                continue

            if d.get('gone'):
                # The client died or reloaded: the hook is gone with it. Everything drained so far
                # is already on disk, which is exactly what we need.
                print('client/hook gone after %d entries -- record kept' % n, flush=True)
                # Try to reinstall in case it was only a WebUI reload.
                cdp_eval(args.addr, INSTALL, timeout=8)
                continue

            for entry in d.get('batch', []):
                fh.write(json.dumps(entry) + '\n')
                n += 1

            if d.get('batch'):
                fh.flush()
                os.fsync(fh.fileno())   # survive a hard client crash
                print('  +%d (total %d)' % (len(d['batch']), n), flush=True)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\nstopped')
