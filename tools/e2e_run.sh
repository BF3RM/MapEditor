#!/usr/bin/env bash
# Boot a VU server + client cold, then run one e2e script from tools/e2e.
#
# Match the client as vu\.(com|exe): the launcher runs the GUI build (vu.exe) and vu.com is only
# the console-subsystem variant. Matching vu\.com alone made every suite report
# "FATAL: client would not start" while a perfectly healthy client was running -- 7/7 spurious
# failures. The server is matched by -serverInstancePath, never by binary name, because both
# binaries serve both roles.
#
#   VU_JOIN=vu://join/<server-guid> tools/e2e_run.sh vehicle_e2e.py [args...]
#
# Every run is a COLD boot on purpose: MapEditor ext changes are only picked up by a full server
# restart, not by a reload, so reusing a live server silently tests the old code.
#
# Env: VU_JOIN (required)  VU_INSTANCE (default ~/Games/VeniceUnleashed/instance)
set -u
I="${VU_INSTANCE:-$HOME/Games/VeniceUnleashed/instance}"
M="$I/Admin/Mods/MapEditor"
SCRIPT="${1:?usage: e2e_run.sh <script.py> [args]}"; shift || true
JOIN="${VU_JOIN:?set VU_JOIN=vu://join/<server-guid>}"

# pgrep -f matches THIS shell (its argv contains the pattern); killing that aborts the run.
kill_match() {
  for p in $(pgrep -f "$1"); do
    [ "$p" = "$$" ] && continue
    case "$(ps -o comm= -p "$p" 2>/dev/null)" in bash|sh|dash|zsh) continue;; esac
    kill -TERM "$p" 2>/dev/null
  done
}
kill_match "serverInstancePath.*-server"; kill_match "vu\.(com|exe).*dwebui"

# Wait for the OLD server to actually let go of its port before starting a new one. A fixed sleep
# raced it: the replacement server would fail to bind, exit, and the run died as
# "server never became ready" with no server.log at all.
for i in $(seq 1 30); do
  pgrep -f "^/home/powos/Games/VeniceUnleashed/client/vu\.(com|exe)" >/dev/null || break
  sleep 2
done
sleep 5

tmux kill-session -t vusrv 2>/dev/null; rm -f "$I/logs/server.log"
tmux new-session -d -s vusrv "cd '$I' && exec setsid script -qfec './.powos-server-launch.sh' logs/server.log"
for i in $(seq 1 ${VU_BOOT_TRIES:-70}); do
  [ -f "$I/logs/server.log" ] && grep -aq "accepting connections" "$I/logs/server.log" && break
  sleep 3
done
# One retry: a server that never wrote a log at all is almost always a port still in TIME_WAIT.
if ! grep -aq "accepting connections" "$I/logs/server.log" 2>/dev/null; then
  echo "server did not come up; retrying once"
  tmux kill-session -t vusrv 2>/dev/null; rm -f "$I/logs/server.log"; sleep 10
  tmux new-session -d -s vusrv "cd '$I' && exec setsid script -qfec './.powos-server-launch.sh' logs/server.log"
  for i in $(seq 1 ${VU_BOOT_TRIES:-70}); do
    [ -f "$I/logs/server.log" ] && grep -aq "accepting connections" "$I/logs/server.log" && break
    sleep 3
  done
fi
grep -aq "accepting connections" "$I/logs/server.log" 2>/dev/null || { echo "FATAL: server never became ready"; exit 2; }
echo "server ready"

# The client sometimes aborts on a PulseAudio assert during boot; retry once.
for attempt in 1 2; do
  cd "$I" && nohup powos mods vu play -debuglog "$JOIN" -dwebui > /tmp/vu-client.log 2>&1 &
  sleep 40
  if pgrep -f "vu\.(com|exe).*dwebui" >/dev/null; then break; fi
  echo "client died on boot (attempt $attempt):"; grep -iE "assert|abort" /tmp/vu-client.log | tail -2
done
pgrep -f "vu\.(com|exe).*dwebui" >/dev/null || { echo "FATAL: client would not start"; exit 2; }

cd "$M/tools/e2e" && python3 "$SCRIPT" "$@"
rc=$?
echo "E2E_EXIT=$rc"
exit $rc
