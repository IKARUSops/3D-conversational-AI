"use client";
/** Language context for the landing page (FR-A6). Default Bangla; choice kept in localStorage. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  dictionaries,
  isLang,
  type Dictionary,
  type Lang,
} from "./dictionary";

interface LangContextValue {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (isLang(saved)) setLangState(saved);
    } catch {
      /* storage blocked: stay on Bangla */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ lang, t: dictionaries[lang], setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}
