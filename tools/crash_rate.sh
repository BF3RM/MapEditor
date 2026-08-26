#!/usr/bin/env bash
# How often does a plain vehicle edit kill the server, with the live-respawn flag ON vs OFF?
#
# Three runs died with the flag on, then one survived with it off, then one died with it off. That
# is not a signal, it is noise -- attributing a crash to a flag on one run each is exactly the
# mistake that has cost this session hours. So: N cold runs per setting, counted.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$HERE/../ext/Shared/Types/GameObject.lua"
N="${N:-3}"

for setting in false true; do
  sed -i "s/^local LIVE_RESPAWN_ENABLED = .*/local LIVE_RESPAWN_ENABLED = $setting/" "$GO"
  died=0; lived=0
  for i in $(seq 1 "$N"); do
    out=$("$HERE/e2e_run.sh" live_edit_e2e.py 2>&1 | tail -20)
    if echo "$out" | grep -q "DIED"; then died=$((died+1)); else lived=$((lived+1)); fi
    echo "  [$setting run $i] $(echo "$out" | grep -oE 'DIED[^)]*\)|PASS:.*|FAIL:.*' | head -1)"
  done
  echo "LIVE_RESPAWN=$setting -> died $died / lived $lived (of $N)"
done
sed -i "s/^local LIVE_RESPAWN_ENABLED = .*/local LIVE_RESPAWN_ENABLED = false/" "$GO"
echo "flag restored to false"
