#!/usr/bin/env bash
# StarConverge one-click start
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

MODE="auto"       # auto | docker | local
REBUILD=0         # 1 = 强制重新构建镜像
PORT="${PORT:-8787}"

for arg in "$@"; do
  case "$arg" in
    auto|docker|local) MODE="$arg" ;;
    --rebuild|rebuild|-b) REBUILD=1 ;;
    -h|--help)
      echo "用法: $0 [auto|docker|local] [--rebuild]"
      echo "  默认拉取/复用阿里云预构建镜像后启动"
      echo "  --rebuild  强制重新拉取镜像后再启动"
      exit 0
      ;;
    *)
      err "未知参数: $arg"
      echo "用法: $0 [auto|docker|local] [--rebuild]"
      exit 1
      ;;
  esac
done

banner() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║       StarConverge 一键启动          ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  echo ""
}

ensure_env() {
  if [[ ! -f "$ROOT/server/.env" ]]; then
    info "生成 server/.env ..."
    cp "$ROOT/server/.env.example" "$ROOT/server/.env"
    # randomize JWT secret on first run
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
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  fi
}

have_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

start_docker() {
  info "使用 Docker Compose 启动（预构建镜像）..."
  ensure_env

  # sync deploy/.env into compose
  set -a
  # shellcheck disable=SC1091
  source "$DEPLOY_DIR/.env"
  set +a

  IMAGE="${IMAGE:-crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com/yxl_image_registry/starconverge:v1.0.0}"
  PULL_POLICY="${PULL_POLICY:-missing}"
  export IMAGE PULL_POLICY

  COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.yml" --project-directory "$ROOT")

  if [[ "$REBUILD" -eq 1 ]]; then
    info "拉取最新镜像: $IMAGE"
    if ! "${COMPOSE[@]}" pull; then
      err "拉取镜像失败。若为私有仓库，请先登录："
      echo "  docker login crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com"
      exit 1
    fi
  else
    # 本地没有该镜像时再拉取
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
      info "本地无镜像，正在拉取: $IMAGE"
      if ! "${COMPOSE[@]}" pull; then
        err "拉取镜像失败。若为私有仓库，请先登录："
        echo "  docker login crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com"
        exit 1
      fi
    else
      info "复用本地镜像，跳过拉取（更新版本请用: $0 --rebuild）"
    fi
  fi

  "${COMPOSE[@]}" up -d

  ok "容器已启动"
  echo ""
  echo -e "  镜像           : ${CYAN}${IMAGE}${NC}"
  echo -e "  管理后台 / API : ${CYAN}http://127.0.0.1:${PORT}${NC}"
  echo -e "  健康检查       : ${CYAN}http://127.0.0.1:${PORT}/health${NC}"
  echo -e "  默认账号       : ${YELLOW}admin / admin123${NC}（请尽快修改）"
  echo ""
  echo "  查看日志:  $DEPLOY_DIR/logs.sh"
  echo "  停止服务:  $DEPLOY_DIR/stop.sh"
  echo ""
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
  err "未找到 pnpm，请先安装 Node.js ≥ 20 与 pnpm"
  exit 1
}

start_local() {
  info "使用本地 Node.js 启动..."
  ensure_env

  if ! command -v node >/dev/null 2>&1; then
    err "未找到 node，请安装 Node.js ≥ 20，或改用: $0 docker"
    exit 1
  fi

  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$NODE_MAJOR" -lt 20 ]]; then
    err "需要 Node.js ≥ 20，当前: $(node -v)"
    exit 1
  fi

  ensure_pnpm

  info "安装依赖..."
  pnpm install

  info "构建前端与后端..."
  pnpm --filter @starconverge/admin build
  pnpm --filter @starconverge/server build

  mkdir -p "$ROOT/data" "$DEPLOY_DIR/run"

  # seed only when DB missing
  DB_PATH="$ROOT/data/starconverge.db"
  if [[ ! -f "$DB_PATH" ]]; then
    info "初始化数据库并生成演示密钥..."
    pnpm db:seed | tee "$DEPLOY_DIR/run/seed.log"
  fi

  # stop previous local instance if any
  if [[ -f "$DEPLOY_DIR/run/server.pid" ]]; then
    OLD_PID="$(cat "$DEPLOY_DIR/run/server.pid" || true)"
    if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      warn "停止旧进程 PID=$OLD_PID"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
  fi

  info "启动 API 服务 (port ${PORT})..."
  export PORT HOST="${HOST:-0.0.0.0}"
  # shellcheck disable=SC1091
  set -a; source "$ROOT/server/.env"; set +a
  export PORT="${PORT}"
  export DATABASE_PATH="${DATABASE_PATH:-$ROOT/data/starconverge.db}"

  nohup node "$ROOT/server/dist/index.js" \
    > "$DEPLOY_DIR/run/server.log" 2>&1 &
  echo $! > "$DEPLOY_DIR/run/server.pid"

  sleep 1
  if kill -0 "$(cat "$DEPLOY_DIR/run/server.pid")" 2>/dev/null; then
    ok "本地服务已启动 (PID $(cat "$DEPLOY_DIR/run/server.pid"))"
  else
    err "启动失败，日志见 $DEPLOY_DIR/run/server.log"
    tail -n 40 "$DEPLOY_DIR/run/server.log" || true
    exit 1
  fi

  echo ""
  echo -e "  管理后台 / API : ${CYAN}http://127.0.0.1:${PORT}${NC}"
  echo -e "  健康检查       : ${CYAN}http://127.0.0.1:${PORT}/health${NC}"
  echo -e "  默认账号       : ${YELLOW}admin / admin123${NC}"
  echo -e "  运行日志       : ${CYAN}$DEPLOY_DIR/run/server.log${NC}"
  echo ""
  echo "  停止服务:  $DEPLOY_DIR/stop.sh"
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
    if have_docker; then
      start_docker
    else
      warn "未检测到可用 Docker，回退到本地模式"
      start_local
    fi
    ;;
esac
