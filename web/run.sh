#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Start both the FastAPI backend and the Vite React frontend
# Usage:  ./web/run.sh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Allow port override via env (set these in web/.env or export before running)
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# ── Backend ─────────────────────────────────────────────────────
echo "🔧 Setting up backend..."

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

source "$BACKEND_DIR/.venv/bin/activate"

echo "Installing backend dependencies..."
pip install -q -r "$BACKEND_DIR/requirements.txt"

echo "Starting backend on http://localhost:$BACKEND_PORT ..."
cd "$BACKEND_DIR"
uvicorn app.main:app --reload --port "$BACKEND_PORT" &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────
echo ""
echo "🔧 Setting up frontend..."

# Generate frontend/.env with correct ports from this single source of truth
cat > "$FRONTEND_DIR/.env" <<EOF
VITE_API_PORT=$BACKEND_PORT
VITE_DEV_PORT=$FRONTEND_PORT
EOF

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

echo "Starting frontend on http://localhost:$FRONTEND_PORT ..."
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

# ── Cleanup on exit ──────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Expense Analyzer is running!"
echo "  Frontend:  http://localhost:$FRONTEND_PORT"
echo "  Backend:   http://localhost:$BACKEND_PORT"
echo "  API Docs:  http://localhost:$BACKEND_PORT/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop."
echo ""

wait
