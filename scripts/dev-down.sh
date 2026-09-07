#!/usr/bin/env bash
# Stops whatever ./scripts/dev-up.sh started (tracked via .dev-pids/*.pid).
# Services it found already running (started outside this script) are left
# alone, same as dev-up.sh leaves them alone.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/.dev-pids"

if [ ! -d "$PID_DIR" ] || [ -z "$(ls -A "$PID_DIR" 2>/dev/null)" ]; then
  echo "Nothing tracked in $PID_DIR — either nothing was started via dev-up.sh, or it's already stopped."
  exit 0
fi

for pidfile in "$PID_DIR"/*.pid; do
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    # dev-up.sh started this via setsid, so $pid is also its process group —
    # signal the whole group (-$pid) to catch tsx watch's forked child too,
    # not just the wrapper process.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    echo "  $name: stopped (pid $pid)"
  else
    echo "  $name: already stopped"
  fi
  rm -f "$pidfile"
done
