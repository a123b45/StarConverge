/** Client-side copy of RBAC catalog (keep in sync with server/src/rbac/permissions.ts). */

export type PermItem = { key: string; label: string };
export type PermGroup = { id: string; label: string; items: PermItem[] };

export const MENU_GROUPS: PermGroup[] = [
  {
    id: "ops",
    label: "运营",
    items: [
      { key: "menu.dashboard", label: "控制台" },
      { key: "menu.usage", label: "用量检测" },
      { key: "menu.logs", label: "请求日志" },
    ],
  },
  {
    id: "resources",
    label: "资源",
    items: [
      { key: "menu.channels", label: "供应商管理" },
      { key: "menu.proxy", label: "模型管理" },
    ],
  },
  {
    id: "policy",
    label: "策略",
    items: [
      { key: "menu.routes", label: "路由管理" },
      { key: "menu.proxyHttp", label: "代理转发" },
      { key: "menu.apiKeys", label: "API 密钥" },
      { key: "menu.tokens", label: "密钥管理" },
    ],
  },
  {
    id: "system",
    label: "系统",
    items: [
      { key: "menu.users", label: "用户管理" },
      { key: "menu.roles", label: "角色管理" },
      { key: "menu.settings", label: "API 文档" },
    ],
  },
  {
    id: "portal",
    label: "用户门户",
    items: [
      { key: "menu.portal.models", label: "模型列表" },
      { key: "menu.portal.keys", label: "API 密钥" },
      { key: "menu.portal.usage", label: "用量" },
      { key: "menu.portal.chat", label: "对话测试" },
      { key: "menu.portal.docs", label: "API 文档" },
      { key: "menu.portal.recharge", label: "充值" },
      { key: "menu.portal.bills", label: "账单" },
    ],
  },
];

export const API_GROUPS: PermGroup[] = [
  {
    id: "channels",
    label: "供应商",
    items: [
      { key: "api.channels.read", label: "查看" },
      { key: "api.channels.write", label: "增改删/测试" },
    ],
  },
  {
    id: "tokens",
    label: "密钥",
    items: [
      { key: "api.tokens.read", label: "查看" },
      { key: "api.tokens.write", label: "创建/禁用/删除" },
    ],
  },
  {
    id: "routes",
    label: "路由",
    items: [
      { key: "api.routes.read", label: "查看" },
      { key: "api.routes.write", label: "增改删" },
    ],
  },
  {
    id: "proxy",
    label: "模型管理",
    items: [
      { key: "api.proxy.read", label: "查看" },
      { key: "api.proxy.write", label: "增改删" },
    ],
  },
  {
    id: "users",
    label: "用户",
    items: [
      { key: "api.users.read", label: "查看" },
      { key: "api.users.write", label: "创建/改密/删除" },
    ],
  },
  {
    id: "roles",
    label: "角色",
    items: [
      { key: "api.roles.read", label: "查看" },
      { key: "api.roles.write", label: "增改删" },
    ],
  },
  {
    id: "logs",
    label: "日志与用量",
    items: [
      { key: "api.logs.read", label: "查看日志" },
      { key: "api.usage.read", label: "查看用量" },
      { key: "api.dashboard.read", label: "查看控制台" },
    ],
  },
];

export const MENU_PATH_MAP: Record<string, string> = {
  "menu.dashboard": "/admin",
  "menu.usage": "/admin/usage",
  "menu.logs": "/admin/logs",
  "menu.channels": "/admin/channels",
  "menu.apiKeys": "/admin/api-keys",
  "menu.tokens": "/admin/tokens",
  "menu.routes": "/admin/models",
  "menu.proxy": "/admin/proxy",
  "menu.proxyHttp": "/admin/http-proxy",
  "menu.users": "/admin/users",
  "menu.roles": "/admin/roles",
  "menu.settings": "/admin/settings",
  "menu.portal.models": "/app/models",
  "menu.portal.keys": "/app/keys",
  "menu.portal.usage": "/app/usage",
  "menu.portal.chat": "/app/chat",
  "menu.portal.docs": "/app/docs",
  "menu.portal.recharge": "/app/recharge",
  "menu.portal.bills": "/app/bills",
};
