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
      echo "  local   源码部署（默认）：自动准备 Node/pnpm → install → build → 启动"
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

# 启动摘要里可直接复制的公网地址（优先 PUBLIC_BASE_URL）
public_base_url() {
  if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
    local url="${PUBLIC_BASE_URL%/}"
    echo "${url}/"
    return
  fi
  local host="${PUBLIC_HOST:-inkstudio.work}"
  host="${host#http://}"
  host="${host#https://}"
  host="${host%%/*}"
  host="${host%%:*}"
  if [[ -z "$host" ]]; then
    host="inkstudio.work"
  fi
  echo "https://${host}/"
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

  # 早期示例默认 admin123，与文档 123456 不一致；启动时自动对齐
  if grep -q '^ADMIN_PASSWORD=admin123$' "$ROOT/server/.env" 2>/dev/null; then
    warn "检测到旧默认密码 admin123，已改为 123456（可在 server/.env 自行修改）"
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' 's/^ADMIN_PASSWORD=admin123$/ADMIN_PASSWORD=123456/' "$ROOT/server/.env"
    else
      sed -i 's/^ADMIN_PASSWORD=admin123$/ADMIN_PASSWORD=123456/' "$ROOT/server/.env"
    fi
  fi

  if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env" 2>/dev/null || true
  fi

  # 公网入口用域名；旧 IP 启动摘要一并迁走
  if [[ -f "$ROOT/server/.env" ]]; then
    if grep -qE '^PUBLIC_HOST=193\.112\.202\.161$' "$ROOT/server/.env" 2>/dev/null; then
      sed -i 's/^PUBLIC_HOST=193\.112\.202\.161$/PUBLIC_HOST=inkstudio.work/' "$ROOT/server/.env"
    fi
    if ! grep -q '^PUBLIC_HOST=' "$ROOT/server/.env" 2>/dev/null; then
      echo "PUBLIC_HOST=inkstudio.work" >> "$ROOT/server/.env"
    fi
    if ! grep -q '^PUBLIC_BASE_URL=' "$ROOT/server/.env" 2>/dev/null; then
      echo "PUBLIC_BASE_URL=https://inkstudio.work" >> "$ROOT/server/.env"
    fi
  fi
  if [[ -f "$DEPLOY_DIR/.env" ]]; then
    if grep -qE '^PUBLIC_HOST=193\.112\.202\.161$' "$DEPLOY_DIR/.env" 2>/dev/null; then
      sed -i 's/^PUBLIC_HOST=193\.112\.202\.161$/PUBLIC_HOST=inkstudio.work/' "$DEPLOY_DIR/.env"
    fi
    if ! grep -q '^PUBLIC_HOST=' "$DEPLOY_DIR/.env" 2>/dev/null; then
      echo "PUBLIC_HOST=inkstudio.work" >> "$DEPLOY_DIR/.env"
    fi
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
  ok "容器已启动 → $(public_base_url)"
}

NODE_VERSION="${NODE_VERSION:-22.14.0}"
RUNTIME_DIR="$DEPLOY_DIR/runtime"

# 把 deploy/runtime 里的 node 放到 PATH 最前
use_runtime_node() {
  if [[ -x "$RUNTIME_DIR/node/bin/node" ]]; then
    export PATH="$RUNTIME_DIR/node/bin:$PATH"
  fi
}

ensure_node() {
  use_runtime_node

  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
      ok "Node.js $(node -v)"
      return
    fi
    warn "系统 Node $(node -v) 过旧，将下载便携版 ≥20"
  else
    info "未检测到 Node.js，将自动下载便携版到 deploy/runtime/"
  fi

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *)
      err "不支持的架构: $ARCH，请手动安装 Node.js ≥ 20"
      exit 1
      ;;
  esac

  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  if [[ "$OS" != "linux" && "$OS" != "darwin" ]]; then
    err "当前仅自动安装 linux/darwin 便携 Node，请手动安装"
    exit 1
  fi

  NAME="node-v${NODE_VERSION}-${OS}-${NODE_ARCH}"
  FILE="${NAME}.tar.xz"
  MIRROR1="https://npmmirror.com/mirrors/node/v${NODE_VERSION}/${FILE}"
  MIRROR2="https://nodejs.org/dist/v${NODE_VERSION}/${FILE}"

  mkdir -p "$RUNTIME_DIR"
  TMP_TAR="$RUNTIME_DIR/${FILE}"

  info "下载 Node.js v${NODE_VERSION} (${OS}-${NODE_ARCH})..."
  if command -v curl >/dev/null 2>&1; then
    if ! curl -fL --retry 3 --connect-timeout 15 -o "$TMP_TAR" "$MIRROR1"; then
      warn "镜像站失败，尝试 nodejs.org..."
      curl -fL --retry 3 --connect-timeout 30 -o "$TMP_TAR" "$MIRROR2"
    fi
  elif command -v wget >/dev/null 2>&1; then
    if ! wget -O "$TMP_TAR" "$MIRROR1"; then
      wget -O "$TMP_TAR" "$MIRROR2"
    fi
  else
    err "需要 curl 或 wget 以下载 Node.js"
    exit 1
  fi

  info "解压到 $RUNTIME_DIR/node ..."
  rm -rf "$RUNTIME_DIR/node"
  tar -xJf "$TMP_TAR" -C "$RUNTIME_DIR"
  mv "$RUNTIME_DIR/$NAME" "$RUNTIME_DIR/node"
  rm -f "$TMP_TAR"

  use_runtime_node
  if ! command -v node >/dev/null 2>&1; then
    err "Node 安装失败"
    exit 1
  fi
  ok "已安装便携 Node $(node -v) → $RUNTIME_DIR/node"
}

ensure_pnpm() {
  use_runtime_node
  if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm $(pnpm -v)"
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    info "启用 corepack pnpm..."
    # corepack 可能需要写系统目录；失败则用 npm 装到 runtime
    if corepack enable 2>/dev/null && corepack prepare pnpm@9.15.0 --activate 2>/dev/null; then
      ok "pnpm $(pnpm -v)"
      return
    fi
    warn "corepack 不可用，改用 npm 安装 pnpm 到 runtime"
  fi
  info "安装 pnpm 到 deploy/runtime..."
  mkdir -p "$RUNTIME_DIR/node"
  npm install -g pnpm@9.15.0 --prefix "$RUNTIME_DIR/node"
  use_runtime_node
  if ! command -v pnpm >/dev/null 2>&1; then
    err "pnpm 安装失败"
    exit 1
  fi
  ok "pnpm $(pnpm -v)"
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
  ensure_node
  ensure_pnpm
  mkdir -p "$ROOT/data" "$DEPLOY_DIR/run"

  # better-sqlite3 等原生模块需要编译工具
  if ! command -v g++ >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1; then
    warn "未检测到 g++/make。若 pnpm install 失败，请先安装编译工具："
    echo "  dnf install -y gcc-c++ make python3"
  fi

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
  if [[ "${DATABASE_PATH:-}" == "./data/"* ]] || [[ "${DATABASE_PATH:-}" == "data/"* ]] || [[ -z "${DATABASE_PATH:-}" ]]; then
    export DATABASE_PATH="$ROOT/data/starconverge.db"
  fi

  # 确保后台进程也能找到 runtime node（better-sqlite3 等已编译进 node_modules）
  use_runtime_node
  # 固定 cwd，避免静态资源相对路径错位
  cd "$ROOT"
  nohup env PATH="$PATH" node "$ROOT/server/dist/index.js" \
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

  # 展示可复制的公网地址（PUBLIC_HOST 来自 server/.env / deploy/.env）
  echo ""
  echo -e "  模式           : ${CYAN}源码部署${NC}"
  echo -e "  Node           : ${CYAN}$(node -v)${NC}"
  echo -e "  管理后台 / API : ${CYAN}$(public_base_url)${NC}"
  echo -e "  健康检查       : ${CYAN}http://127.0.0.1:${PORT}/health${NC}"
  echo -e "  管理员账号     : ${YELLOW}${ADMIN_USERNAME:-admin} / ${ADMIN_PASSWORD:-123456}${NC}"
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
    start_local
    ;;
esac
