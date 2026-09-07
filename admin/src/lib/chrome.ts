export type ThemeMode = "light" | "dark";
export type LangMode = "zh" | "en";

const THEME_KEY = "sc_theme";
const LANG_KEY = "sc_lang";

export const LANG_OPTIONS: Array<{ id: LangMode; label: string; native: string }> = [
  { id: "zh", label: "简体中文", native: "中文" },
  { id: "en", label: "English", native: "EN" },
];

export function getTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === "dark" ? "dark" : "light";
}

export function setTheme(theme: ThemeMode): ThemeMode {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

export function toggleTheme(): ThemeMode {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function getLang(): LangMode {
  const v = localStorage.getItem(LANG_KEY);
  return v === "en" ? "en" : "zh";
}

export function setLang(lang: LangMode): LangMode {
  const next: LangMode = lang === "en" ? "en" : "zh";
  localStorage.setItem(LANG_KEY, next);
  document.documentElement.setAttribute("data-lang", next);
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  window.dispatchEvent(new CustomEvent("sc-lang", { detail: next }));
  return next;
}

export function applyChromePrefs() {
  setTheme(getTheme());
  setLang(getLang());
}

type Copy = {
  lang: string;
  themeLight: string;
  themeDark: string;
  notify: string;
  account: string;
  logout: string;
  profile: string;
  displayName: string;
  password: string;
  save: string;
  cancel: string;
  noNotify: string;
  notifyModels: string;
  notifyPricing: string;
  notifyTypeModels: string;
  notifyTypePricing: string;
};

const zh: Copy = {
  lang: "语言",
  themeLight: "切换到夜间模式",
  themeDark: "切换到日间模式",
  notify: "通知",
  account: "账号设置",
  logout: "退出登录",
  profile: "账号信息",
  displayName: "显示名",
  password: "新密码（可选）",
  save: "保存",
  cancel: "取消",
  noNotify: "暂无新通知",
  notifyModels: "新同步到模型列表，快去看看吧！",
  notifyPricing: "价格有变动，快去看看吧！",
  notifyTypeModels: "模型",
  notifyTypePricing: "价格",
};

const en: Copy = {
  lang: "Language",
  themeLight: "Switch to dark mode",
  themeDark: "Switch to light mode",
  notify: "Notifications",
  account: "Account",
  logout: "Log out",
  profile: "Profile",
  displayName: "Display name",
  password: "New password (optional)",
  save: "Save",
  cancel: "Cancel",
  noNotify: "No new notifications",
  notifyModels: "just synced to the model list. Take a look!",
  notifyPricing: "had a price update. Take a look!",
  notifyTypeModels: "Models",
  notifyTypePricing: "Pricing",
};

export const chromeCopy: Record<LangMode, Copy> = { zh, en };

export function formatUserNotification(
  lang: LangMode,
  type: "models" | "pricing",
  models: string[],
  fallback = "",
): string {
  const names = models.map((m) => m.trim()).filter(Boolean);
  const n = names.length;
  const preview = names.slice(0, 2).join(lang === "en" ? ", " : "、");
  const t = chromeCopy[lang];
  if (!n) return fallback;
  if (lang === "zh") {
    if (type === "pricing") {
      return n <= 1
        ? `${preview} 的价格有变动，快去看看吧！`
        : `${preview} 等 ${n} 个模型价格有变动，快去看看吧！`;
    }
    return n <= 1
      ? `${preview} 新同步到模型列表，快去看看吧！`
      : `${preview} 等 ${n} 个模型新同步到模型列表，快去看看吧！`;
  }
  if (n <= 1) return `${preview} ${type === "pricing" ? t.notifyPricing : t.notifyModels}`;
  return `${preview} and ${n} models ${type === "pricing" ? t.notifyPricing : t.notifyModels}`;
}
