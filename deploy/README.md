# Deploy

一键启动 StarConverge（使用阿里云预构建镜像，无需本地 build）。

## 镜像

```
crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com/yxl_image_registry/starconverge:v1.0.0
```

私有仓库需先登录一次：

```bash
docker login crpi-h49so3m1b8wov228.cn-hangzhou.personal.cr.aliyuncs.com
```

## 快速开始

```bash
chmod +x deploy/*.sh
./deploy/start.sh
```

- **第一次**：自动 `docker pull` 镜像后启动  
- **之后**：直接启动，不重复拉取  
- **换新版本 / 强制更新**：`./deploy/start.sh --rebuild`

```bash
./deploy/start.sh              # 启动（本地有镜像则跳过拉取）
./deploy/start.sh --rebuild    # 强制重新拉取再启动
./deploy/start.sh docker       # 仅 Docker
./deploy/start.sh local        # 仅本地 pnpm/node（不走镜像）
```

## 常用命令

| 脚本 | 说明 |
|------|------|
| `./deploy/start.sh` | 启动（无本地镜像才拉取） |
| `./deploy/start.sh --rebuild` | 重新拉取并启动 |
| `./deploy/stop.sh` | 停止服务 |
| `./deploy/logs.sh` | 查看日志 |

## 配置

```bash
cp deploy/.env.example deploy/.env
```

| 变量 | 说明 |
|------|------|
| `IMAGE` | 镜像地址（可改 tag） |
| `PULL_POLICY` | `missing` / `always` / `never` |
| `PORT` | 宿主机端口 |
| `ADMIN_*` | 后台账号 |

## 访问

- 管理后台 / API：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/health`
- 默认账号：`admin` / `admin123`
