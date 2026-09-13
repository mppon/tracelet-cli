/** 本文件负责 Dashboard 语言检测、持久化和 React 上下文接入。 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import type { I18nValue, Locale, Messages } from "./types";

const storageKey = "tracelet.locale";
const dictionaries: Record<Locale, Messages> = { "zh-CN": zhCN, en };
const I18nContext = createContext<I18nValue | undefined>(undefined);

/** 按持久化设置、浏览器语言和默认值选择界面语言。 */
export function pickLocale(saved?: string | null, browser?: string): Locale {
  if (saved === "zh-CN" || saved === "en") {
    return saved;
  }
  if (!browser) {
    return "zh-CN";
  }
  return browser.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** 读取浏览器中的初始语言偏好。 */
function initialLocale(): Locale {
  return pickLocale(window.localStorage?.getItem(storageKey), window.navigator?.language);
}

/** 向 Dashboard 组件树提供当前语言和切换能力。 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const value = useMemo<I18nValue>(
    () => ({ locale, messages: dictionaries?.[locale] ?? zhCN, setLocale }),
    [locale],
  );

  /** 持久化语言，并同步更新页面的 lang 属性。 */
  useEffect(() => {
    window.localStorage?.setItem(storageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 返回当前 Dashboard 的国际化上下文。 */
export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n 必须在 I18nProvider 内使用");
  }
  return context;
}

export type { Locale, Messages } from "./types";
