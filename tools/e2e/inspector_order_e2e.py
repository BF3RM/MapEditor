#!/usr/bin/env python3
"""Inspector fields must be grouped and ordered by the TYPE INHERITANCE CHAIN.

The field list used to be flat and effectively random: `$fields` is a JSON OBJECT built from a Lua
hash table, so its key order is whatever `pairs` produced. The serializer now sends `$fieldOrder`
(declaration order, base-most declaring type first) and `$fieldGroups` (the slices of it each type
declares); InstanceProperty renders a header per declaring type.

Four assertions, because the cheap one passes while the feature is broken:

* groups actually arrive (a partition serialized without them silently falls back to flat),
* the DOM row order matches the group order exactly -- rendering the right groups in the wrong
  order looks fine in a screenshot,
* the CONCRETE type's group is LAST, i.e. the chain runs base-most first and not reversed,
* every field still appears exactly once. "Ordered but a field went missing" is the regression
  this change is most likely to introduce.

Usage:  python3 inspector_order_e2e.py [--addr localhost:8884] [--count 12]
Exit 0 = ordered and complete, 1 = wrong/missing, 2 = could not set up.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor, VU_CDP_PY  # noqa: E402


def wait_for_cdp(addr, timeout=600):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            p = subprocess.run(["python3", VU_CDP_PY, "--addr", addr, "targets"],
                               capture_output=True, text=True, timeout=10)
            if "main/players" in (p.stdout or "") or "mapeditor" in (p.stdout or ""):
                return True
        except Exception:
            pass
        time.sleep(5)
    return False


# Read every rendered InstanceProperty: the grouping its instance carries, and the order the rows
# actually came out in. Property renders NOTHING for a field called `name` (v-if in its template),
# so the expected sequence has to skip those too.
PROBE = r"""(function(){
  var out=[];
  var nodes=document.querySelectorAll('.instance-property');
  for(var n=0;n<nodes.length;n++){
    var vm=nodes[n].__vue__; if(!vm||!vm.instance) continue;
    var inst=vm.instance, groups=vm.groups||[];
    var expected=[], names=[], dup=false, seen={};
    for(var g=0;g<groups.length;g++){
      expected.push('#'+groups[g].typeName);
      for(var f=0;f<groups[g].fields.length;f++){
        var fn=groups[g].fields[f].name;
        if(seen[fn]) dup=true; seen[fn]=1; names.push(fn);
        if(fn!=='name') expected.push(fn);
      }
    }
    var actual=[];
    var table=nodes[n].querySelector('.table');
    if(table){ for(var i=0;i<table.children.length;i++){ var c=table.children[i];
      var cls=String(c.className||'');
      if(cls.indexOf('type-group')!==-1){ var t=c.querySelector('.type-name');
        actual.push('#'+(t?t.textContent.trim():'?')); }
      else if(c.__vue__ && c.__vue__.field){ actual.push(c.__vue__.field.name); } } }
    var all=Object.keys(inst.fields);
    var missing=[]; for(var k=0;k<all.length;k++){ if(!seen[all[k]]) missing.push(all[k]); }
    out.push({type:inst.typeName, chain:groups.map(function(x){return x.typeName;}),
              nGroups:groups.length, expected:expected, actual:actual,
              dup:dup, missing:missing, nFields:all.length});
  }
  return JSON.stringify({nodes:out});})()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--addr", default="localhost:8884")
    ap.add_argument("--count", type=int, default=12)
    args = ap.parse_args()
    addr = args.addr

    if not wait_for_cdp(addr):
        print("SETUP: no CDP target"); return 2
    if not enter_game(addr, timeout=300):
        print("SETUP: could not enter the editor"); return 2
    print("editor:", wait_for_editor(addr, timeout=200), flush=True)

    cdp_eval(addr, """(function(){
      var d=window.editor.gameObjects, ks=d.keys(), seen={}, out=[];
      for(var i=0;i<ks.length;i++){ var g=d.getValue(ks[i]);
        if(!g||!g.blueprintCtrRef) continue;
        var k=String(g.blueprintCtrRef.instanceGuid); if(seen[k]) continue; seen[k]=1;
        out.push(g); if(out.length>=%d) break; }
      window.__ord=out; window.__i=0;
      window.__step=function(){ if(window.__i>=window.__ord.length) return 'done';
        var g=window.__ord[window.__i++];
        window.editor.selectionGroup.select(g,false,false);
        var insp=document.querySelector('.inspector-component');
        if(insp&&insp.__vue__) insp.__vue__.selectedGameObject=g;
        return 'ok'; };
      return JSON.stringify({queued:out.length});})()""" % args.count)

    checked = 0
    grouped = 0
    failures = []
    chains = []

    for _ in range(args.count):
        if cdp_eval(addr, "(function(){return JSON.stringify({s:window.__step()});})()") is None:
            break
        time.sleep(6)
        res = cdp_eval(addr, PROBE)
        if not isinstance(res, dict):
            continue
        for node in res.get("nodes", []):
            checked += 1
            if node["nGroups"] == 0:
                # Not fatal on its own: a single-instance fallback partition can legitimately
                # arrive without ordering. Fatal only if NOTHING is ever grouped (checked below).
                continue
            grouped += 1
            if len(chains) < 6:
                chains.append(node["type"] + ": " + " -> ".join(node["chain"]))
            if node["chain"][-1] != node["type"]:
                failures.append(f"{node['type']}: concrete type is not the LAST group "
                                f"(chain {node['chain']}) — the chain is reversed")
            if node["expected"] != node["actual"]:
                for i, (e, a) in enumerate(zip(node["expected"], node["actual"])):
                    if e != a:
                        failures.append(f"{node['type']}: row {i} is '{a}', expected '{e}'")
                        break
                else:
                    failures.append(f"{node['type']}: rendered {len(node['actual'])} rows, "
                                    f"expected {len(node['expected'])}")
            if node["missing"]:
                failures.append(f"{node['type']}: {len(node['missing'])} field(s) vanished from the "
                                f"grouping: {node['missing'][:5]}")
            if node["dup"]:
                failures.append(f"{node['type']}: a field appears in more than one group")

    print(f"inspected {checked} rendered instances, {grouped} grouped", flush=True)
    for c in chains:
        print("   chain:", c)

    if grouped == 0:
        print("FAIL: no instance arrived with a type grouping — the ext is not sending "
              "$fieldOrder/$fieldGroups (a full SERVER RESTART is required for ext changes)")
        return 1
    if failures:
        print(f"FAIL: {len(failures)} ordering problem(s):")
        for f in failures[:12]:
            print("   ", f)
        return 1

    print(f"PASS: {grouped} instances grouped by inheritance chain, rows in declaration order, "
          f"no field lost or duplicated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
