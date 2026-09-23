import { LOCALES, LOCALE_LABELS, type Locale } from '../i18n/locales';

export function LanguageSelect({
  locale,
  label,
  onChange,
}: {
  locale: Locale;
  label: string;
  onChange: (locale: Locale) => void;
}) {
  return (
    <label className="lang-select">
      <span className="visually-hidden">{label}</span>
      <select value={locale} aria-label={label} onChange={(event) => onChange(event.target.value as Locale)}>
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
