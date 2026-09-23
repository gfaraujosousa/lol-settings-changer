import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { de } from './de';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';
import { ko } from './ko';
import { detectLocale, isLocale, LOCALE_STORAGE_KEY, type Locale } from './locales';
import { ptBR } from './pt-BR';
import { zhCN } from './zh-CN';

const DICTS: Record<Locale, Messages> = {
  en,
  'pt-BR': ptBR,
  es,
  fr,
  'zh-CN': zhCN,
  ko,
  de,
};

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      messages: DICTS[locale],
      setLocale: (next) => {
        if (!isLocale(next)) {
          return;
        }
        setLocaleState(next);
        try {
          globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next);
        } catch {
          // ignore
        }
      },
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('useLocale must be used inside LocaleProvider');
  }
  return value;
}
