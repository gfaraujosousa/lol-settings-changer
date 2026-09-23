export const LOCALES = ['en', 'pt-BR', 'es', 'fr', 'zh-CN', 'ko', 'de'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português',
  es: 'Español',
  fr: 'Français',
  'zh-CN': '简体中文',
  ko: '한국어',
  de: 'Deutsch',
};

export const KOFI_URL = 'https://ko-fi.com/notbielson';
export const GITHUB_REPO = 'gfaraujosousa/lol-settings-changer';
export const APP_VERSION = '0.2.0';

export const LOCALE_STORAGE_KEY = 'lol-settings-changer.locale';
export const ONBOARDING_STORAGE_KEY = 'lol-settings-changer.onboarding-seen';
export const TAB_STORAGE_KEY = 'lol-settings-changer.tab';

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (LOCALES as readonly string[]).includes(value));
}

export function detectLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }

  const language = globalThis.navigator?.language ?? 'en';
  if (language.toLowerCase().startsWith('pt')) {
    return 'pt-BR';
  }
  if (language.toLowerCase().startsWith('es')) {
    return 'es';
  }
  if (language.toLowerCase().startsWith('fr')) {
    return 'fr';
  }
  if (language.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }
  if (language.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  if (language.toLowerCase().startsWith('de')) {
    return 'de';
  }
  return 'en';
}
