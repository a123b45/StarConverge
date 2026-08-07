#!/usr/bin/env bash
# Tail StarConverge logs（优先源码日志）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$DEPLOY_DIR/run/server.log" ]]; then
  exec tail -n 200 -f "$DEPLOY_DIR/run/server.log"
fi

if command -v docker >/dev/null 2>&1 \
  && docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" ps -q 2>/dev/null | grep -q .; then
  exec docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" logs -f --tail=200
fi

echo "未找到运行中的服务日志"
exit 1
