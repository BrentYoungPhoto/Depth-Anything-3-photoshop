#!/usr/bin/env bash
# Start the Depth Mask Plugin in development mode.
# Launches the Python backend and the Electron+Vite dev server concurrently.
#
# Usage:
#   ./scripts/start-dev.sh
#
# The plugin loads models on-demand via the UI, so no model directory
# is required at startup.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR="$PROJECT_ROOT/plugin"

# Default backend port
BACKEND_PORT="${BACKEND_PORT:-8089}"

echo "=== Depth Mask Plugin - Development Mode ==="
echo "  Backend port:    $BACKEND_PORT"
echo "  Plugin dir:      $PLUGIN_DIR"
echo "============================================="

# Install plugin dependencies if needed
if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Installing plugin dependencies..."
  cd "$PLUGIN_DIR" && npm install
fi

# Start Python backend in the background
echo "Starting Python backend..."
PYTHONPATH="$PROJECT_ROOT/src" python -m uvicorn \
  "depth_anything_3.services.mask_api:create_plugin_app" \
  --factory \
  --host 127.0.0.1 \
  --port "$BACKEND_PORT" &
BACKEND_PID=$!

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$BACKEND_PORT/api/v1/status" > /dev/null 2>&1; then
    echo "Backend is ready!"
    break
  fi
  sleep 1
done

# Start Vite dev server + Electron
echo "Starting Electron dev mode..."
cd "$PLUGIN_DIR" && npm run electron:dev
