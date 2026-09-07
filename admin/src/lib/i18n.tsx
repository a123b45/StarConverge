import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getLang, setLang as persistLang, type LangMode } from "./chrome";
import { EN, ZH, type MsgKey } from "./i18n-copy";

type I18nValue = {
  lang: LangMode;
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: LangMode) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangMode>(() =>
    typeof window !== "undefined" ? getLang() : "zh",
  );

  useEffect(() => {
    function onLang(e: Event) {
      const next = (e as CustomEvent<LangMode>).detail;
      if (next === "zh" || next === "en") setLangState(next);
    }
    window.addEventListener("sc-lang", onLang);
    return () => window.removeEventListener("sc-lang", onLang);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = lang === "en" ? EN : ZH;
    return {
      lang,
      t: (key, vars) => interpolate(dict[key] ?? ZH[key] ?? key, vars),
      setLang: (next) => {
        persistLang(next);
        setLangState(next);
      },
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: "zh",
      t: (key, vars) => interpolate(ZH[key] ?? key, vars),
      setLang: persistLang,
    };
  }
  return ctx;
}
