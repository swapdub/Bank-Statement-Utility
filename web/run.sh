#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Start both the FastAPI backend and the Vite React frontend
# Usage:  ./web/run.sh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Backend ──────────────────────────────────────────────────────
echo "🔧 Setting up backend..."

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

source "$BACKEND_DIR/.venv/bin/activate"

echo "Installing backend dependencies..."
pip install -q -r "$BACKEND_DIR/requirements.txt"

echo "Starting backend on http://localhost:8000 ..."
cd "$BACKEND_DIR"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────
echo ""
echo "🔧 Setting up frontend..."

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

echo "Starting frontend on http://localhost:5173 ..."
npm run dev &
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
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop."
echo ""

wait
