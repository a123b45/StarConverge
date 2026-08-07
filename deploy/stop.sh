#!/usr/bin/env bash
# Stop StarConverge（源码进程 + Docker 容器）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "[INFO] 停止 StarConverge..."

# Local PID
if [[ -f "$DEPLOY_DIR/run/server.pid" ]]; then
  PID="$(cat "$DEPLOY_DIR/run/server.pid" || true)"
  if [[ -n "${PID}" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    echo "[OK] 源码进程已停止 (PID $PID)"
  fi
  rm -f "$DEPLOY_DIR/run/server.pid"
fi

# Docker
if command -v docker >/dev/null 2>&1; then
  if docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" ps -q 2>/dev/null | grep -q .; then
    docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" down
    echo "[OK] Docker 服务已停止"
  fi
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx starconverge; then
    docker stop starconverge >/dev/null 2>&1 || true
    docker rm starconverge >/dev/null 2>&1 || true
    echo "[OK] 容器 starconverge 已移除"
  fi
fi

echo "[OK] 完成"
