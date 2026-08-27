#!/usr/bin/env python3
"""Selecting VANILLA objects must give each one something to outline.

The client's EntityFactory:CreateFromBlueprint hook never fires, so every vanilla object arrives
as server-only transfer data with no entities of its own. Both halves of the box path have failed
here before: the client did not ask, and then the server refused to answer for anything that was
not editor-spawned.

Walks several vanilla objects, preferring vehicles, and fails if any selected object ends up with
no box.
"""
import json
import sys
import time

from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor

ADDR = sys.argv[1] if len(sys.argv) > 1 else "localhost:8884"
WANTED = 6

LIST_JS = r"""
(function(){
  var e = window.editor; if (!e) return JSON.stringify({error:'no editor'});
  var vals = e.gameObjects.values(), veh = [], other = [];
  for (var i = 0; i < vals.length; i++) {
    var n = (vals[i].name || '').toString();
    if (/lav|bmp|vodnik|tank|humvee|vehicle/i.test(n)) veh.push(vals[i].guid.toString());
    else if (other.length < 40) other.push(vals[i].guid.toString());
  }
  return JSON.stringify({vehicles: veh.slice(0, 40), other: other, total: vals.length});
})()
"""

SELECT_JS = """
(function(n){
  var e = window.editor; if (!e) return JSON.stringify({error:'no editor'});
  var vals = e.gameObjects.values(), veh = [];
  for (var i = 0; i < vals.length; i++) {
    var nm = (vals[i].name || '').toString();
    if (/lav|bmp|vodnik|tank|humvee|vehicle/i.test(nm)) veh.push(vals[i]);
  }
  var list = veh.length ? veh : vals;
  if (n >= list.length) return JSON.stringify({error:'out of range'});
  var go = list[n];
  // Select the OBJECT straight from the list: a guid round-trip through
  // getGameObjectByGuid did not resolve and silently skipped every candidate.
  e.selectionGroup.select(go, false, false);
  e.threeManager.syncNativeSelection();   // a JS-only select never reaches Lua
  window.__boxReport = null;
  return JSON.stringify({name: go.name, origin: go.origin});
})(%d)
"""

REPORT_JS = "(function(){ window.vext.SendEvent('BoxReport'); return JSON.stringify({sent:true}); })()"
READ_JS = "(function(){ return JSON.stringify(window.__boxReport || {pending:true}); })()"


def ask_report(tries=12):
    for _ in range(tries):
        cdp_eval(ADDR, REPORT_JS)
        time.sleep(1.0)
        r = cdp_eval(ADDR, READ_JS)
        if isinstance(r, str):
            try:
                r = json.loads(r)
            except Exception:
                continue
        # Accept ANY answer from the viewport. Requiring rows made "the selection never reached
        # Lua" indistinguishable from "the report never came back".
        if isinstance(r, dict) and not r.get("pending") and "active" in r:
            return r
    return None


if not enter_game(ADDR, timeout=200) or not wait_for_editor(ADDR, timeout=200):
    print("[box] client never reached the editor")
    sys.exit(2)

time.sleep(25)  # let the tree fill

listing = cdp_eval(ADDR, LIST_JS)
if isinstance(listing, str):
    listing = json.loads(listing)
if not isinstance(listing, dict) or listing.get("error"):
    print("[box] could not list objects: %s" % listing)
    sys.exit(2)

guids = list(range(WANTED))

print("[box] %d objects loaded; testing %d (%d vehicles found)"
      % (listing.get("total", 0), len(guids), len(listing.get("vehicles") or [])))

failures, checked = [], 0
for guid in guids:
    sel = cdp_eval(ADDR, SELECT_JS % guid)
    if isinstance(sel, str):
        sel = json.loads(sel)
    if not isinstance(sel, dict) or sel.get("error"):
        continue

    rep = ask_report()

    if checked == 0 and not failures:
        print("   raw report for '%s': %s" % (sel.get("name"), json.dumps(rep)[:300]))

    if rep is None:
        failures.append((sel.get("name"), "no report"))
        continue
    if not rep.get("active"):
        print("[box] viewport inactive (mode=%s player=%s soldier=%s) — cannot judge"
              % (rep.get("mode"), rep.get("hasPlayer"), rep.get("hasSoldier")))
        sys.exit(2)

    rows = rep.get("rows") or []

    if not rows:
        failures.append((sel.get("name"), "selection never reached Lua"))
        continue

    checked += 1
    row = rows[0]
    boxes = row.get("boxes", 0)
    print("   %-52s entities=%-3s boxes=%s" % (str(sel.get("name"))[:52],
                                               row.get("entities"), boxes))
    if boxes < 1:
        failures.append((sel.get("name"), "no box"))

if checked == 0:
    print("[box] nothing could be checked; failures: %s" % failures[:6])
    sys.exit(2)

if failures:
    print("[box] FAIL: %d/%d selected objects had no box:" % (len(failures), checked))
    for name, why in failures:
        print("        %s (%s)" % (name, why))
    sys.exit(1)

print("[box] PASS: all %d selected objects had a box" % checked)
