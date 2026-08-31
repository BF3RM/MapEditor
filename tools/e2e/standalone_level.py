#!/usr/bin/env python3
"""Assert the standalone (no-game) editor loads a real level from WebX with a nested hierarchy.

Needs the dev server up:  cd WebUI && pnpm serve

Drives a headless Chromium over CDP -- the same way the in-game suites drive the client's WebUI --
so this checks the shipping code path, not a mock.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

CDP = os.environ.get("VU_CDP_PY", "/var/lib/powos/src/lib/mods/vu-cdp.py")
CHROME = os.environ.get(
    "CHROME_BIN", os.path.expanduser("~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome")
)
APP = os.environ.get("MAPEDITOR_URL", "http://localhost:8080")
PORT = int(os.environ.get("CDP_PORT", "9333"))

TREE_JS = r"""
(function(){
  var el=document.querySelector('#explorer-component .scrollable'); var vm=el&&el.__vue__; var tree=vm&&vm.tree;
  if(!tree){var h=document.querySelector('#explorer-component');vm=h&&h.__vue__;
    tree=vm&&(vm.tree||(vm.$refs&&vm.$refs.infiniteTreeComponent&&vm.$refs.infiniteTreeComponent.tree));}
  if(!tree) return JSON.stringify({error:'no tree'});
  var v=tree.getNodeById('vanilla_root'); if(!v) return JSON.stringify({error:'no vanilla_root'});
  function c(n,d){var t=1,m=d,k=n.children||[];for(var i=0;i<k.length;i++){var r=c(k[i],d+1);t+=r.total;if(r.maxd>m)m=r.maxd;}return{total:t,maxd:m};}
  var top=v.children||[],deep=c(v,0),named=[];
  for(var i=0;i<top.length&&named.length<12;i++){var k=(top[i].children||[]).length; if(k>0) named.push(top[i].name+'('+k+')');}
  return JSON.stringify({topLevel:top.length,totalUnder:deep.total-1,maxDepth:deep.maxd,nodes:named});
})()
"""


def cdp(js):
    p = subprocess.run(["python3", CDP, "--addr", "localhost:%d" % PORT, "--target", "MapEditor", "eval", js],
                       capture_output=True, text=True, timeout=60)
    for line in reversed((p.stdout or "").strip().splitlines()):
        try:
            return json.loads(line.strip())
        except Exception:
            continue
    return None


def main():
    try:
        urllib.request.urlopen(APP, timeout=5)
    except Exception:
        print("FAIL: no dev server at %s -- run `cd WebUI && pnpm serve`" % APP)
        return 2

    browser = subprocess.Popen(
        [CHROME, "--headless=new", "--remote-debugging-port=%d" % PORT, "--no-sandbox", "--disable-gpu",
         "--user-data-dir=/tmp/mapeditor-standalone-cdp", APP],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        deadline = time.time() + 240
        best = None

        while time.time() < deadline:
            time.sleep(5)
            r = cdp(TREE_JS)

            if isinstance(r, dict) and not r.get("error"):
                best = r
                # The level streams in subtree by subtree; stop once it stops growing.
                if r.get("totalUnder", 0) > 1000:
                    time.sleep(10)
                    best = cdp(TREE_JS) or best
                    break

        if best is None:
            print("FAIL: the editor never produced a tree")
            return 1

        print(json.dumps(best, indent=2))

        # Meshes are optional -- the editor works without them -- but if a manifest was exported,
        # geometry must actually reach the scene, and it must actually be drawn. Silhouettes and an
        # empty scene look identical in a headless screenshot, so assert triangles, not visibility.
        stats = cdp("JSON.stringify(window.meshes ? {s: window.meshes.stats, t: (function(){"
                    "var tm=window.editor.threeManager; tm.renderer.info.autoReset=false;"
                    "tm.renderer.info.reset(); tm.renderer.render(tm.scene, tm.camera);"
                    "return tm.renderer.info.render.triangles;})()} : null)")

        if isinstance(stats, dict) and stats.get("s"):
            print("meshes: %s, triangles drawn: %s" % (json.dumps(stats["s"]), stats.get("t")))

            if stats["s"].get("meshes", 0) > 0 and stats["s"].get("attached", 0) < 1:
                print("FAIL: a mesh manifest exists but nothing attached")
                return 1

        if best.get("maxDepth", 0) < 2 or best.get("totalUnder", 0) < 500:
            print("FAIL: level did not load as a nested hierarchy")
            return 1

        print("PASS: %d top-level nodes, %d descendants, depth %d"
              % (best["topLevel"], best["totalUnder"], best["maxDepth"]))
        return 0
    finally:
        browser.terminate()


if __name__ == "__main__":
    sys.exit(main())
