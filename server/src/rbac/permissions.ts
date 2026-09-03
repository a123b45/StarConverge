/** StarConverge RBAC permission catalog (menu + API). */

export type PermItem = {
  key: string;
  label: string;
};

export type PermGroup = {
  id: string;
  label: string;
  items: PermItem[];
};

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
      { key: "menu.pricing", label: "模型定价" },
    ],
  },
  {
    id: "policy",
    label: "策略",
    items: [
      { key: "menu.routes", label: "路由管理" },
      { key: "menu.apiKeys", label: "API 密钥" },
      { key: "menu.tokens", label: "密钥管理" },
    ],
  },
  {
    id: "system",
    label: "系统",
    items: [
      { key: "menu.customers", label: "客户管理" },
      { key: "menu.users", label: "用户管理" },
      { key: "menu.cardKeys", label: "卡密管理" },
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
      { key: "menu.portal.estimate", label: "计费预估" },
      { key: "menu.portal.recharge", label: "充值" },
      { key: "menu.portal.bills", label: "账单" },
      { key: "menu.portal.docs", label: "API 文档" },
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
    id: "pricing",
    label: "模型定价",
    items: [
      { key: "api.pricing.read", label: "查看" },
      { key: "api.pricing.write", label: "增改删" },
    ],
  },
  {
    id: "customers",
    label: "客户",
    items: [
      { key: "api.customers.read", label: "查看" },
      { key: "api.customers.write", label: "创建/充值/编辑" },
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
    id: "cardKeys",
    label: "卡密",
    items: [
      { key: "api.cardKeys.read", label: "查看" },
      { key: "api.cardKeys.write", label: "创建/删除" },
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

export const ALL_MENU_KEYS = MENU_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const ALL_API_KEYS = API_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const ALL_PERM_KEYS = [...ALL_MENU_KEYS, ...ALL_API_KEYS];

export const ADMIN_MENU_KEYS = ALL_MENU_KEYS.filter((k) => !k.startsWith("menu.portal."));

export function isAdminCapable(menuPerms: string[]): boolean {
  return menuPerms.some((k) => ADMIN_MENU_KEYS.includes(k));
}

export const MENU_PATH_MAP: Record<string, string> = {
  "menu.dashboard": "/admin",
  "menu.usage": "/admin/usage",
  "menu.logs": "/admin/logs",
  "menu.channels": "/admin/channels",
  "menu.apiKeys": "/admin/api-keys",
  "menu.tokens": "/admin/tokens",
  "menu.routes": "/admin/models",
  "menu.proxy": "/admin/proxy",
  "menu.pricing": "/admin/pricing",
  "menu.customers": "/admin/customers",
  "menu.users": "/admin/users",
  "menu.cardKeys": "/admin/card-keys",
  "menu.roles": "/admin/roles",
  "menu.settings": "/admin/settings",
  "menu.portal.models": "/app/models",
  "menu.portal.keys": "/app/keys",
  "menu.portal.usage": "/app/usage",
  "menu.portal.chat": "/app/chat",
  "menu.portal.estimate": "/app/estimate",
  "menu.portal.docs": "/app/docs",
  "menu.portal.recharge": "/app/recharge",
  "menu.portal.bills": "/app/bills",
};

/** Default seed roles — only 管理员 + 用户 */
export const FIXED_ROLE_KEYS = ["admin", "portal_user"] as const;

export const DEFAULT_ROLES = [
  {
    key: "portal_user",
    name: "用户",
    description: "用户门户：模型、密钥、用量、对话、文档、充值与账单",
    isSystem: true,
    menuPerms: [
      "menu.portal.models",
      "menu.portal.keys",
      "menu.portal.usage",
      "menu.portal.chat",
      "menu.portal.estimate",
      "menu.portal.recharge",
      "menu.portal.bills",
      "menu.portal.docs",
    ],
    apiPerms: [] as string[],
  },
  {
    key: "admin",
    name: "管理员",
    description:
      "管理端：运营（控制台/用量/日志）、资源与策略（供应商/模型/定价/路由/密钥）、系统（客户/用户/角色/文档）",
    isSystem: true,
    menuPerms: ALL_MENU_KEYS.filter((k) => !k.startsWith("menu.portal.")),
    apiPerms: ALL_API_KEYS,
  },
] as const;
