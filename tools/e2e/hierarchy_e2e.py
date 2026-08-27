#!/usr/bin/env python3
"""Assert the scene tree actually nests: worldparts/subworlds are parents, not a flat list.

The regression this guards: the client resolves no hierarchy of its own (its
EntityFactory:CreateFromBlueprint hook never fires), so every object arrives from the server as
"server-only". Announcing those one at a time gave the WebUI tree builder no parent to attach to
and it dropped the whole level into the flat 'Vanilla' bucket.
"""
import json
import sys
import time

from mapeditor_e2e import cdp_eval, enter_game, wait_for_editor

ADDR = sys.argv[1] if len(sys.argv) > 1 else "localhost:8884"

READ_TREE = r"""
(function(){
  var el = document.querySelector('#explorer-component .scrollable');
  var vm = el && el.__vue__;
  var tree = vm && vm.tree;
  if (!tree) {
    var host = document.querySelector('#explorer-component');
    vm = host && host.__vue__;
    tree = vm && (vm.tree || (vm.$refs && vm.$refs.infiniteTreeComponent && vm.$refs.infiniteTreeComponent.tree));
  }
  if (!tree) return JSON.stringify({error: 'no tree'});
  var vanilla = tree.getNodeById('vanilla_root');
  if (!vanilla) return JSON.stringify({error: 'no vanilla_root'});
  function count(n, depth){
    var total = 1, maxd = depth, kids = n.children || [];
    for (var i = 0; i < kids.length; i++){
      var r = count(kids[i], depth + 1);
      total += r.total; if (r.maxd > maxd) maxd = r.maxd;
    }
    return {total: total, maxd: maxd};
  }
  var top = vanilla.children || [];
  var deep = count(vanilla, 0);
  var named = [];
  for (var i = 0; i < Math.min(top.length, 6); i++) {
    named.push({name: top[i].name, kids: (top[i].children || []).length});
  }
  return JSON.stringify({
    topLevel: top.length,       // direct children of Vanilla
    totalUnder: deep.total - 1, // every descendant of Vanilla
    maxDepth: deep.maxd,        // 1 == flat list
    sample: named
  });
})()
"""

if not enter_game(ADDR, timeout=200):
    print("[hier] client never reached the level")
    sys.exit(2)

if not wait_for_editor(ADDR, timeout=180):
    print("[hier] editor never opened")
    sys.exit(2)

# The tree fills progressively (WebUpdater drains 40 updates a tick), so let it settle.
best = {}
for _ in range(30):
    time.sleep(4)
    r = cdp_eval(ADDR, READ_TREE)
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:
            continue
    if not isinstance(r, dict) or r.get("error"):
        continue
    best = r
    if r.get("totalUnder", 0) > 1000:
        break

if not best:
    print("[hier] could not read the tree")
    sys.exit(2)

print("[hier] %s" % json.dumps(best, indent=2))

flat = best.get("maxDepth", 0) <= 1
crowded = best.get("topLevel", 0) > 200
if flat or crowded:
    print("[hier] FAIL: the tree is flat -- %d objects sit directly under Vanilla (depth %d)"
          % (best.get("topLevel", 0), best.get("maxDepth", 0)))
    sys.exit(1)

print("[hier] PASS: %d top-level nodes under Vanilla, %d descendants, depth %d"
      % (best["topLevel"], best["totalUnder"], best["maxDepth"]))
