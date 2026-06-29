#!/usr/bin/env bash
# Redeploy script for the VPS — pulls latest main, reinstalls deps only where
# manifests changed, rebuilds the frontend, and restarts the two systemd
# services. Run this from the repo root on the VPS (e.g. /opt/factory-brain).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "==> Pulling latest main"
git fetch origin main
BEFORE_BACKEND_LOCK=$(git rev-parse HEAD:backend/package-lock.json 2>/dev/null || echo "")
BEFORE_FRONTEND_LOCK=$(git rev-parse HEAD:frontend/dashboard/package-lock.json 2>/dev/null || echo "")
BEFORE_REQUIREMENTS=$(git rev-parse HEAD:ml-service/requirements.txt 2>/dev/null || echo "")
git reset --hard origin/main
AFTER_BACKEND_LOCK=$(git rev-parse HEAD:backend/package-lock.json 2>/dev/null || echo "")
AFTER_FRONTEND_LOCK=$(git rev-parse HEAD:frontend/dashboard/package-lock.json 2>/dev/null || echo "")
AFTER_REQUIREMENTS=$(git rev-parse HEAD:ml-service/requirements.txt 2>/dev/null || echo "")

if [ "$BEFORE_REQUIREMENTS" != "$AFTER_REQUIREMENTS" ]; then
  echo "==> ml-service/requirements.txt changed — reinstalling Python deps"
  cd "$REPO_DIR/ml-service"
  source venv/bin/activate
  pip install -r requirements.txt
  deactivate
  cd "$REPO_DIR"
fi

if [ "$BEFORE_BACKEND_LOCK" != "$AFTER_BACKEND_LOCK" ]; then
  echo "==> backend/package-lock.json changed — reinstalling Node deps"
  cd "$REPO_DIR/backend"
  npm install --omit=dev
  cd "$REPO_DIR"
fi

if [ "$BEFORE_FRONTEND_LOCK" != "$AFTER_FRONTEND_LOCK" ]; then
  echo "==> frontend/dashboard/package-lock.json changed — reinstalling Node deps"
  cd "$REPO_DIR/frontend/dashboard"
  npm install
  cd "$REPO_DIR"
fi

echo "==> Rebuilding frontend"
cd "$REPO_DIR/frontend/dashboard"
npm run build
cd "$REPO_DIR"

echo "==> Restarting services"
sudo systemctl restart factorybrain-ml
sudo systemctl restart factorybrain-backend
sudo systemctl reload nginx

echo "==> Done. Service status:"
sudo systemctl --no-pager status factorybrain-ml factorybrain-backend | head -20
