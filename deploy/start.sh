#!/usr/bin/env bash
# StarConverge one-click start — 默认源码部署
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERR]${NC} $*" >&2; }

MODE="local"      # local（默认源码）| docker | auto
REBUILD=0
PORT="${PORT:-8787}"

for arg in "$@"; do
  case "$arg" in
    auto|docker|local) MODE="$arg" ;;
    --rebuild|rebuild|-b) REBUILD=1 ;;
    -h|--help)
      echo "用法: $0 [local|docker|auto] [--rebuild]"
      echo "  local   源码部署（默认）：pnpm install → build → 后台启动"
      echo "  docker  使用 Docker / 预构建镜像"
      echo "  --rebuild  强制重新构建后再启动"
      exit 0
      ;;
    *)
      err "未知参数: $arg"
      echo "用法: $0 [local|docker|auto] [--rebuild]"
      exit 1
      ;;
  esac
done

banner() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║     StarConverge 源码一键启动        ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  echo ""
}

ensure_env() {
  if [[ ! -f "$ROOT/server/.env" ]]; then
    info "生成 server/.env ..."
    cp "$ROOT/server/.env.example" "$ROOT/server/.env"
    if command -v openssl >/dev/null 2>&1; then
      SECRET="$(openssl rand -hex 24)"
      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s/ADMIN_JWT_SECRET=.*/ADMIN_JWT_SECRET=${SECRET}/" "$ROOT/server/.env"
      else
        sed -i "s/ADMIN_JWT_SECRET=.*/ADMIN_JWT_SECRET=${SECRET}/" "$ROOT/server/.env"
      fi
    fi
    ok "已创建 server/.env（请按需修改管理员密码）"
  fi

  if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env" 2>/dev/null || true
  fi
}

have_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

stop_docker_if_running() {
  if have_docker; then
    if docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" ps -q 2>/dev/null | grep -q .; then
      warn "检测到 Docker 容器占用，先停止以避免端口冲突..."
      docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT" down || true
    fi
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx starconverge; then
      warn "停止容器 starconverge..."
      docker stop starconverge >/dev/null 2>&1 || true
      docker rm starconverge >/dev/null 2>&1 || true
    fi
  fi
}

start_docker() {
  info "使用 Docker Compose 启动..."
  ensure_env

  set -a
  # shellcheck disable=SC1091
  [[ -f "$DEPLOY_DIR/.env" ]] && source "$DEPLOY_DIR/.env"
  set +a

  IMAGE="${IMAGE:-crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com/yxl_image_registry/starconverge:v1.0.0}"
  PULL_POLICY="${PULL_POLICY:-missing}"
  export IMAGE PULL_POLICY

  COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT")

  if [[ "$REBUILD" -eq 1 ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    info "拉取镜像: $IMAGE"
    "${COMPOSE[@]}" pull || {
      err "拉取失败。私有仓库请先: docker login crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com"
      exit 1
    }
  fi

  "${COMPOSE[@]}" up -d
  ok "容器已启动 → http://127.0.0.1:${PORT}"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    info "启用 corepack pnpm..."
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
    return
  fi
  err "未找到 pnpm。请安装 Node.js ≥ 20，然后: corepack enable"
  exit 1
}

stop_local_if_running() {
  if [[ -f "$DEPLOY_DIR/run/server.pid" ]]; then
    OLD_PID="$(cat "$DEPLOY_DIR/run/server.pid" || true)"
    if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      warn "停止旧进程 PID=$OLD_PID"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$DEPLOY_DIR/run/server.pid"
  fi
  # 兜底：释放 8787
  if command -v ss >/dev/null 2>&1; then
    PIDS="$(ss -lntp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' || true)"
    for p in $PIDS; do
      if [[ -n "$p" ]]; then
        warn "释放端口 ${PORT}，结束 PID=$p"
        kill "$p" 2>/dev/null || true
      fi
    done
  fi
}

start_local() {
  info "使用源码部署（Node.js）..."
  ensure_env
  stop_docker_if_running

  if ! command -v node >/dev/null 2>&1; then
    err "未找到 node，请先安装 Node.js ≥ 20"
    exit 1
  fi

  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    err "需要 Node.js ≥ 20，当前: $(node -v)"
    exit 1
  fi

  ensure_pnpm
  mkdir -p "$ROOT/data" "$DEPLOY_DIR/run"

  info "安装依赖..."
  pnpm install

  NEED_BUILD=0
  if [[ "$REBUILD" -eq 1 ]]; then
    NEED_BUILD=1
  elif [[ ! -f "$ROOT/server/dist/index.js" || ! -d "$ROOT/admin/dist" ]]; then
    NEED_BUILD=1
  fi

  if [[ "$NEED_BUILD" -eq 1 ]]; then
    info "构建管理台与服务端..."
    pnpm --filter @starconverge/admin build
    pnpm --filter @starconverge/server build
  else
    info "复用已有构建产物（强制重建请加 --rebuild）"
  fi

  DB_PATH="$ROOT/data/starconverge.db"
  # 相对路径时放到仓库根
  if [[ "${DATABASE_PATH:-}" == ./* ]] || [[ -z "${DATABASE_PATH:-}" ]]; then
    :
  fi
  if [[ ! -f "$DB_PATH" ]]; then
    info "初始化数据库并生成演示密钥..."
    pnpm db:seed | tee "$DEPLOY_DIR/run/seed.log"
  fi

  stop_local_if_running

  info "启动 API 服务 (0.0.0.0:${PORT})..."
  # shellcheck disable=SC1091
  set -a
  source "$ROOT/server/.env"
  set +a
  export PORT="${PORT}"
  export HOST="${HOST:-0.0.0.0}"
  # 统一数据库到仓库 data 目录
  if [[ "${DATABASE_PATH:-}" == "./data/"* ]] || [[ "${DATABASE_PATH:-}" == "data/"* ]] || [[ -z "${DATABASE_PATH:-}" ]]; then
    export DATABASE_PATH="$ROOT/data/starconverge.db"
  fi

  nohup node "$ROOT/server/dist/index.js" \
    > "$DEPLOY_DIR/run/server.log" 2>&1 &
  echo $! > "$DEPLOY_DIR/run/server.pid"

  sleep 1
  if kill -0 "$(cat "$DEPLOY_DIR/run/server.pid")" 2>/dev/null; then
    ok "源码服务已启动 (PID $(cat "$DEPLOY_DIR/run/server.pid"))"
  else
    err "启动失败，日志见 $DEPLOY_DIR/run/server.log"
    tail -n 50 "$DEPLOY_DIR/run/server.log" || true
    exit 1
  fi

  echo ""
  echo -e "  模式           : ${CYAN}源码部署${NC}"
  echo -e "  管理后台 / API : ${CYAN}http://0.0.0.0:${PORT}${NC}（外网用服务器公网 IP）"
  echo -e "  健康检查       : ${CYAN}http://127.0.0.1:${PORT}/health${NC}"
  echo -e "  默认账号       : ${YELLOW}admin / admin123${NC}"
  echo -e "  运行日志       : ${CYAN}$DEPLOY_DIR/run/server.log${NC}"
  echo ""
  echo "  更新代码后:  git pull && bash deploy/start.sh --rebuild"
  echo "  停止服务:    bash deploy/stop.sh"
  echo "  查看日志:    bash deploy/logs.sh"
  echo ""
}

banner

case "$MODE" in
  docker)
    start_docker
    ;;
  local)
    start_local
    ;;
  auto)
    # 仍以源码优先；仅无 Node 时才尝试 Docker
    if command -v node >/dev/null 2>&1; then
      start_local
    elif have_docker; then
      warn "未检测到 Node，改用 Docker"
      start_docker
    else
      err "需要 Node.js ≥ 20 或 Docker"
      exit 1
    fi
    ;;
esac
