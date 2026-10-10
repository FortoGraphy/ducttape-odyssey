// UI chrome strings go through i18next (namespaces in ./locales/<lang>/<ns>.ts, real Czech plural
// forms via _one/_few/_many/_other). Authored game content uses L10n objects ({ cs, en }) and tr().
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

import type { L10n } from "@/engine/types";

import { resources } from "./resources";

export type Lang = "cs" | "en";
export type LangSetting = Lang | "system";

export function systemLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === "cs" || code === "sk" ? "cs" : "en";
  } catch {
    return "en";
  }
}

export function resolveLang(setting: LangSetting): Lang {
  return setting === "system" ? systemLang() : setting;
}

i18n.use(initReactI18next).init({
  resources,
  lng: systemLang(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLanguage(setting: LangSetting): void {
  const lang = resolveLang(setting);
  if (i18n.language !== lang) i18n.changeLanguage(lang);
}

export function currentLang(): Lang {
  return i18n.language === "cs" ? "cs" : "en";
}

/** Picks the current language from a content string and fills {placeholders}. */
export function tr(text: L10n | undefined, vars?: Record<string, string | number>): string {
  if (!text) return "";
  let out = (currentLang() === "cs" ? text.cs : text.en) || text.en || text.cs || "";
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

export const t = i18n.t.bind(i18n);
/** `const t = useT("ship")` then `t("deck.upgrade")`. Re-renders on language change. */
export const useT = (ns?: string) => useTranslation(ns).t;
/** Hook form of tr(): re-renders on language change. */
export function useTr(): typeof tr {
  useTranslation();
  return tr;
}
export const useLang = (): Lang => (useTranslation().i18n.language === "cs" ? "cs" : "en");
export default i18n;
