# Deploy

一键启动 StarConverge。

## 快速开始

```bash
chmod +x deploy/*.sh
./deploy/start.sh
```

- **第一次**：自动构建镜像（较慢）
- **之后**：直接启动，不再构建
- **代码更新后**：`./deploy/start.sh --rebuild`

默认优先使用 **Docker**；若本机没有 Docker，会自动回退到 **本地 Node.js** 模式。

```bash
./deploy/start.sh              # 启动（有镜像则跳过构建）
./deploy/start.sh --rebuild    # 强制重新构建再启动
./deploy/start.sh docker       # 仅 Docker
./deploy/start.sh local        # 仅本地 pnpm/node
```

## 常用命令

| 脚本 | 说明 |
|------|------|
| `./deploy/start.sh` | 启动（首次才构建） |
| `./deploy/start.sh --rebuild` | 重新构建并启动 |
| `./deploy/stop.sh` | 停止服务 |
| `./deploy/logs.sh` | 查看日志 |

## 配置

复制并编辑：

```bash
cp deploy/.env.example deploy/.env
```

主要变量：`PORT`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_JWT_SECRET`。

本地模式还会使用 `server/.env`（首次启动自动从 example 生成）。

## 访问

启动成功后：

- 管理后台 / API：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/health`
- 默认账号：`admin` / `admin123`
