# StarConverge

轻量级 **API 中转 / 网关** 平台：统一对外暴露 OpenAI 兼容接口与通用 HTTP 代理，后台管理上游通道、访问密钥、模型路由与用量日志。

## 功能

- **OpenAI 兼容中转**：`/v1/chat/completions`、`/completions`、`/embeddings`、`/models`
- **上游通道**：多通道、权重负载、优先级故障切换、模型改写
- **访问密钥**：配额、每分钟限流、模型白名单
- **通用代理**：任意 HTTP API 挂到 `/proxy/*`
- **管理后台**：总览、通道 / 密钥 / 路由 / 日志
- **SQLite** 单文件存储，开箱即用

## 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm ≥ 9

### 安装与启动

```bash
pnpm install
cp server/.env.example server/.env
pnpm db:seed          # 初始化库并生成演示 API Key
pnpm dev              # 同时启动 API(8787) 与管理台(5173)
```

- 管理后台：http://127.0.0.1:5173  
  默认管理员：`admin` / `123456`；普通用户可注册后进入 `/app`
- API：http://127.0.0.1:8787

### 调用示例

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer sk-sc-你的密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"你好"}]
  }'
```

在管理后台启用「上游通道」并填入真实上游 Base URL / API Key 后再测通。

## 生产部署（源码）

```bash
git clone https://github.com/a123b45/StarConverge.git
cd StarConverge
chmod +x deploy/*.sh
bash deploy/start.sh              # 默认源码部署（无 Node 时自动下载便携版）
# bash deploy/start.sh --rebuild  # 更新代码后重建
```

- 管理后台 / API：`http://服务器IP:8787`
- 默认管理员：`admin` / `123456`（控制台 `/admin`）
- 普通用户：注册后进入门户 `/app`（模型、密钥、用量、对话、文档）
- 日志：`bash deploy/logs.sh` · 停止：`bash deploy/stop.sh`

详见 [deploy/README.md](deploy/README.md)。

可选 Docker：`bash deploy/start.sh docker`（非默认）。

## 目录结构

```
StarConverge/
├── admin/          # React 管理台
├── server/         # Hono API 网关
├── docker-compose.yml
└── README.md
```

## 配置项

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务端口 | `8787` |
| `DATABASE_PATH` | SQLite 路径 | `./data/starconverge.db` |
| `ADMIN_USERNAME` | 后台用户名 | `admin` |
| `ADMIN_PASSWORD` | 后台密码 | `123456` |
| `ADMIN_JWT_SECRET` | 后台 JWT 密钥 | 请务必修改 |
| `CORS_ORIGIN` | CORS | `*` |

## 生产建议

1. 修改 `ADMIN_PASSWORD` 与 `ADMIN_JWT_SECRET`
2. 将 SQLite 目录挂载为持久卷
3. 前置 Nginx / Caddy 做 TLS
4. 按需关闭演示通道，仅保留真实上游
