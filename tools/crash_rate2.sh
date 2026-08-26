#!/usr/bin/env bash
# Crash rate per setting, WITHOUT a cold boot per run.
#
# e2e_run.sh cold-boots every time and hung for 27 minutes on one, which made the measurement
# impossible to finish. The flag only needs a restart when it CHANGES, so restart once per setting
# and reuse the pair, rebooting only after a run that actually killed the server.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
GO="$HERE/../ext/Shared/Types/GameObject.lua"
VUCTL="$HOME/Projects/vu-debug/vuctl.sh"
N="${N:-3}"

boot() {
  "$VUCTL" up >/dev/null 2>&1
  local n=0
  until curl -s --max-time 3 http://127.0.0.1:8884/json >/dev/null 2>&1 || [ $n -ge 60 ]; do
    sleep 5; n=$((n+1))
  done
  sleep 8
}

for setting in false true; do
  sed -i "s/^local LIVE_RESPAWN_ENABLED = .*/local LIVE_RESPAWN_ENABLED = $setting/" "$GO"
  boot
  died=0
  for i in $(seq 1 "$N"); do
    out=$(cd "$HERE/e2e" && timeout 300 python3 live_edit_e2e.py 2>&1 | tail -4)
    verdict=$(echo "$out" | grep -oE 'DIED[^)]*\)|PASS:.*|FAIL:.*|SETUP:.*' | head -1)
    echo "  [$setting $i] ${verdict:-no verdict}"
    if echo "$out" | grep -q "DIED"; then died=$((died+1)); boot; fi
  done
  echo "LIVE_RESPAWN=$setting -> died $died of $N"
done
sed -i "s/^local LIVE_RESPAWN_ENABLED = .*/local LIVE_RESPAWN_ENABLED = false/" "$GO"
echo "ALLDONE flag restored to false"
