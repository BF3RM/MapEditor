#!/usr/bin/env bash
# Run every e2e script back to back, one cold boot each, and summarise.
#   tools/e2e_all.sh                                 # join URL read from the server log
#   VU_JOIN=vu://join/<guid> tools/e2e_all.sh        # or point it somewhere else
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
I="${VU_INSTANCE:-$HOME/Games/VeniceUnleashed/instance}"
SUITES=(mapeditor_e2e.py vehicle_e2e.py weapon_e2e.py reference_edit_e2e.py
        inspector_sweep_e2e.py bulk_edit_e2e.py inspector_chips_e2e.py)
declare -A RC
mkdir -p "$I/logs"
for s in "${SUITES[@]}"; do
  echo "=== $s ($(date +%T)) ==="
  "$HERE/e2e_run.sh" "$s" > "$I/logs/all-${s%.py}.log" 2>&1
  RC[$s]=$?
  tail -3 "$I/logs/all-${s%.py}.log" | grep -E "PASS|FAIL|RESULT|passed|failed" || true
done
echo
echo "================ SUMMARY ================"
fail=0
for s in "${SUITES[@]}"; do
  if [ "${RC[$s]}" = "0" ]; then echo "  PASS  $s"; else echo "  FAIL  $s (exit ${RC[$s]})"; fail=1; fi
done
echo "ALL_DONE"
exit $fail
