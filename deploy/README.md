# Deploy — 源码一键部署

默认使用 **源码部署**（Node.js + pnpm），不再依赖 Docker 镜像。

## 环境要求

- Node.js ≥ 20
- 能访问 npm 源（首次 `pnpm install`）

## 快速开始

```bash
cd StarConverge
git pull
chmod +x deploy/*.sh
bash deploy/start.sh
```

更新代码后强制重建：

```bash
git pull
bash deploy/start.sh --rebuild
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `bash deploy/start.sh` | 源码安装/构建/启动 |
| `bash deploy/start.sh --rebuild` | 强制重新 build 再启动 |
| `bash deploy/stop.sh` | 停止服务 |
| `bash deploy/logs.sh` | 查看日志 |

可选：`bash deploy/start.sh docker` 仍可用镜像方式（非默认）。

## 配置

首次启动会自动生成 `server/.env`。请修改：

- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `PORT`（默认 8787）

数据库默认：`data/starconverge.db`

## 访问

- 管理后台 / API：`http://服务器IP:8787`
- 健康检查：`http://127.0.0.1:8787/health`
- 默认账号：`admin` / `admin123`

外网访问请在云安全组放行 TCP `8787`。
