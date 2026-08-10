export type ThemeMode = "light" | "dark";
export type LangMode = "zh" | "en";

const THEME_KEY = "sc_theme";
const LANG_KEY = "sc_lang";

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
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.setAttribute("data-lang", lang);
  return lang;
}

export function applyChromePrefs() {
  setTheme(getTheme());
  setLang(getLang());
}

export const chromeCopy = {
  zh: {
    lang: "切换语言 / Language",
    settings: "设置",
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
    notifySample: "欢迎使用 StarConverge",
  },
  en: {
    lang: "Language / 中文",
    settings: "Settings",
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
    notifySample: "Welcome to StarConverge",
  },
} as const;
