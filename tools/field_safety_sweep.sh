#!/usr/bin/env bash
#
# Which vehicle blueprint fields can be written LIVE without breaking the next entity build?
#
# gravityModifier written on both realms is safe; exitDirectionSpeedThreshold written the same way
# kills the client. Both are Float32 on the same blueprint. This sweeps a list one field per boot
# and prints a table, turning "live vehicle edits crash" into a rule the editor can enforce.
#
# Each field gets a COLD boot, because a fatal one takes the realm with it and every later result
# would be measured against a corpse. That costs ~2 min per field and is why this runs unattended.
#
#   tools/field_safety_sweep.sh [field ...]
#
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
VUCTL="${VUCTL:-$HOME/Projects/vu-debug/vuctl.sh}"
OUT="${OUT:-$HOME/Projects/vu-debug/logs/field-safety.txt}"

# Default set: shallow fields on VehicleEntityData, plus known-good deep ones for contrast.
FIELDS=("$@")
if [ ${#FIELDS[@]} -eq 0 ]; then
  FIELDS=(
    components.1.vehicleConfig.gravityModifier   # known SAFE -- the control
    exitDirectionSpeedThreshold                  # known FATAL -- the other control
    upsideDownDamage
    upsideDownAngle
    upsideDownDamageDelay
    preDestructionDamageThreshold
    regenerationDelay
    armorMultiplier
    waterDamageOffset
    exitSpeedThreshold
    lockingTimeMultiplier
    preExplosionTime
  )
fi

printf '%-46s %s\n' "FIELD" "RESULT" | tee "$OUT"
printf '%-46s %s\n' "$(printf '%.0s-' {1..46})" "------" | tee -a "$OUT"

for field in "${FIELDS[@]}"; do
  # Cold boot so the previous field's damage cannot contaminate this one.
  "$VUCTL" up >/dev/null 2>&1
  # Wait for CDP to actually ANSWER, not merely for a client process to exist. Waiting on the
  # process and sleeping produced 'Connection refused' and an UNUSABLE row -- a lost 2-minute boot,
  # and worse, a control that silently did not run.
  n=0
  until curl -s --max-time 3 http://127.0.0.1:8884/json >/dev/null 2>&1 || [ $n -ge 60 ]; do
    sleep 5; n=$((n+1))
  done
  sleep 10   # let the join settle before driving the editor

  out=$(cd "$HERE/e2e" && timeout 420 python3 field_safety_e2e.py --field "$field" 2>&1 | tail -1)
  case "$out" in
    SAFE*)  result="SAFE" ;;
    DIED*)  result="FATAL  ${out#DIED: * — }" ;;
    *)      result="UNUSABLE  $out" ;;
  esac
  printf '%-46s %s\n' "$field" "$result" | tee -a "$OUT"
done

echo | tee -a "$OUT"
echo "A field marked UNUSABLE proves nothing -- setup failed and the run must be repeated." | tee -a "$OUT"
echo "Full table: $OUT"
