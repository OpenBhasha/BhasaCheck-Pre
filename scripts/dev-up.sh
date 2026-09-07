#!/usr/bin/env bash
# Starts every local dev process this app needs: Redis, the Python ML
# service, the Node API, the BullMQ worker, and the Vite frontend.
#
# Usage:
#   ./scripts/dev-up.sh            # start everything (skips anything already running)
#   ./scripts/dev-up.sh --logs     # then tail every service's log together
#
# Logs land in .dev-logs/<service>.log, PIDs in .dev-pids/<service>.pid.
# Stop everything with ./scripts/dev-down.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.dev-logs"
PID_DIR="$ROOT/.dev-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

port_in_use() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && exec 3>&- 3<&-
}

pid_alive() {
  local pidfile="$1"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_service() {
  local name="$1" port="$2" workdir="$3"
  shift 3
  local pidfile="$PID_DIR/$name.pid"
  local logfile="$LOG_DIR/$name.log"
  # Full command line, used to detect a matching process that's already
  # running even when it wasn't started by this script (no pidfile) and has
  # no port to check (the worker) — e.g. one left over from a manual
  # `npm run worker` in another terminal.
  local match_pattern="$*"

  if pid_alive "$pidfile"; then
    echo "  $name: already running (pid $(cat "$pidfile"), started by this script)"
    return
  fi
  if [ -n "$port" ] && port_in_use "$port"; then
    echo "  $name: skipping — something is already listening on :$port (not started by this script; leaving it alone)"
    return
  fi
  if pgrep -f "$match_pattern" >/dev/null 2>&1; then
    echo "  $name: skipping — a matching process is already running elsewhere (leaving it alone)"
    return
  fi

  # setsid puts the process in its own new process group; tsx watch (and
  # similar) fork a child to actually run/reload the file, which inherits
  # that same group, so dev-down.sh can tear down the whole tree with one
  # `kill -- -PID` instead of orphaning the child when the wrapper dies.
  (cd "$workdir" && setsid "$@" >"$logfile" 2>&1 &
   echo $! >"$pidfile")
  echo "  $name: starting (pid $(cat "$pidfile"), log: ${logfile#"$ROOT/"})"
}

wait_for_http() {
  local name="$1" url="$2"
  for _ in $(seq 1 30); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "  $name: up ($url)"
      return 0
    fi
    sleep 1
  done
  echo "  $name: did not respond at $url within 30s — check .dev-logs/$name.log"
  return 1
}

echo "== Redis =="
if command -v redis-server >/dev/null; then
  start_service redis 6379 "$ROOT" redis-server --port 6379
else
  echo "  redis-server not found — install it, or run 'docker compose up redis' instead"
fi

echo "== ML service (Python) =="
if [ -x "$ROOT/ml-service/.venv/bin/uvicorn" ]; then
  start_service ml-service 8000 "$ROOT/ml-service" \
    "$ROOT/ml-service/.venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload
else
  echo "  ml-service/.venv not found — see MANAGE.md §1 to set it up first"
fi

echo "== Backend API =="
start_service backend 5000 "$ROOT/backend" \
  "$ROOT/backend/node_modules/.bin/tsx" watch src/server.ts

echo "== BullMQ worker =="
# No port of its own — restart-avoidance relies on the pidfile plus the
# pgrep fallback in start_service (matching a manually-started worker too).
start_service worker "" "$ROOT/backend" \
  "$ROOT/backend/node_modules/.bin/tsx" watch src/workers/audioProcessing.worker.ts

echo "== Frontend =="
start_service frontend 5173 "$ROOT/frontend" \
  "$ROOT/frontend/node_modules/.bin/vite" --port 5173

echo
echo "Waiting for HTTP services to come up..."
wait_for_http ml-service http://localhost:8000/health || true
wait_for_http backend http://localhost:5000/ping || true
wait_for_http frontend http://localhost:5173 || true

echo
echo "Frontend:  http://localhost:5173"
echo "Backend:   http://localhost:5000"
echo "ML service: http://localhost:8000"
echo "Logs:      $LOG_DIR/"
echo "Stop all:  ./scripts/dev-down.sh"

if [ "${1:-}" = "--logs" ]; then
  echo
  echo "Tailing logs (Ctrl+C to stop tailing — services keep running)..."
  tail -f "$LOG_DIR"/*.log
fi
