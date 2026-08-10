export type ThemeMode = "light" | "dark";
export type LangMode = "zh" | "en" | "ja" | "ko";

const THEME_KEY = "sc_theme";
const LANG_KEY = "sc_lang";

export const LANG_OPTIONS: Array<{ id: LangMode; label: string; native: string }> = [
  { id: "zh", label: "简体中文", native: "中文" },
  { id: "en", label: "English", native: "EN" },
  { id: "ja", label: "日本語", native: "日本語" },
  { id: "ko", label: "한국어", native: "한국어" },
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
  if (v === "en" || v === "ja" || v === "ko" || v === "zh") return v;
  return "zh";
}

export function setLang(lang: LangMode): LangMode {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.setAttribute("data-lang", lang);
  window.dispatchEvent(new CustomEvent("sc-lang", { detail: lang }));
  return lang;
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
  notifySample: string;
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
  notifySample: "欢迎使用 StarConverge",
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
  notifySample: "Welcome to StarConverge",
};

const ja: Copy = {
  lang: "言語",
  themeLight: "ダークモードに切替",
  themeDark: "ライトモードに切替",
  notify: "通知",
  account: "アカウント設定",
  logout: "ログアウト",
  profile: "プロフィール",
  displayName: "表示名",
  password: "新しいパスワード（任意）",
  save: "保存",
  cancel: "キャンセル",
  noNotify: "新しい通知はありません",
  notifySample: "StarConverge へようこそ",
};

const ko: Copy = {
  lang: "언어",
  themeLight: "다크 모드로 전환",
  themeDark: "라이트 모드로 전환",
  notify: "알림",
  account: "계정 설정",
  logout: "로그아웃",
  profile: "프로필",
  displayName: "표시 이름",
  password: "새 비밀번호 (선택)",
  save: "저장",
  cancel: "취소",
  noNotify: "새 알림 없음",
  notifySample: "StarConverge에 오신 것을 환영합니다",
};

export const chromeCopy: Record<LangMode, Copy> = { zh, en, ja, ko };
