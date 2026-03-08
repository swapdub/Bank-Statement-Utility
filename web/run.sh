#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Start both the FastAPI backend and the Vite React frontend
# Usage:  ./web/run.sh
# Set ports via web/.env (BACKEND_PORT, FRONTEND_PORT)
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Load web/.env if present — single source of truth for config
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# Defaults if not set in .env or environment
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# ── Backend ─────────────────────────────────────────────────────
echo "🔧 Setting up backend..."

# Use PYTHON_CMD env var to override python version (e.g. python3.11, python3.13)
PYTHON_CMD="${PYTHON_CMD:-python3}"

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  "$PYTHON_CMD" -m venv "$BACKEND_DIR/.venv"
fi

source "$BACKEND_DIR/.venv/bin/activate"

echo "Installing backend dependencies..."
# Install parent package requirements so bank_statement_utility modules are importable
pip install -q -r "$SCRIPT_DIR/../requirements.txt"
pip install -q -r "$BACKEND_DIR/requirements.txt"
# Add parent directory to PYTHONPATH so bank_statement_utility is importable
# without running pip install -e (which triggers setup.py and fails if deps aren't present first)
export PYTHONPATH="$SCRIPT_DIR/..:${PYTHONPATH:-}"

echo "Starting backend on http://0.0.0.0:$BACKEND_PORT ..."
cd "$BACKEND_DIR"
uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────────
echo ""
echo "🔧 Setting up frontend..."

# Generate frontend/.env with correct ports — do not edit frontend/.env manually
cat > "$FRONTEND_DIR/.env" <<EOF
VITE_API_PORT=$BACKEND_PORT
VITE_DEV_PORT=$FRONTEND_PORT
${VITE_API_BASE_URL:+VITE_API_BASE_URL=$VITE_API_BASE_URL}
${VITE_API_BASE_URL:+}# VITE_API_BASE_URL=
EOF

cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

echo "Starting frontend on http://0.0.0.0:$FRONTEND_PORT ..."
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
echo "  Frontend:  http://0.0.0.0:$FRONTEND_PORT"
echo "  Backend:   http://0.0.0.0:$BACKEND_PORT"
echo "  API Docs:  http://0.0.0.0:$BACKEND_PORT/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop."
echo ""

wait
