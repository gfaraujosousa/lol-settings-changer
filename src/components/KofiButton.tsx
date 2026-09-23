import { KOFI_URL, GITHUB_REPO } from '../i18n/locales';
import { openExternal } from '../lib/openExternal';

export function KofiButton({ label }: { label: string }) {
  return (
    <button type="button" className="kofi-button" onClick={() => void openExternal(KOFI_URL)}>
      <svg className="kofi-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M18.6 7.2H17V5.8c0-.8-.7-1.5-1.5-1.5H4.2C3.3 4.3 2.6 5 2.6 5.8v6.9c0 2.4 1.9 4.4 4.4 4.6.3 1.6 1.7 2.8 3.4 2.8h1.3c1.9 0 3.4-1.4 3.6-3.2h.7c2.6 0 4.7-2.1 4.7-4.7V11c0-2.1-1.6-3.8-3.6-3.8zm1.5 4.6c0 1.7-1.4 3.1-3.1 3.1h-.5V8.8h.9c1.5 0 2.7 1.3 2.7 2.8v.2z"
        />
        <path
          fill="#ff5e5b"
          d="M9.1 8.4c-1.4 0-2.1 1.5-2.1 1.5S6.4 8.4 5 8.4c-1.2 0-2 .9-2 2.1 0 2.3 3.1 4.4 4.1 5.1.2.1.4.1.6 0 1-.7 4.1-2.8 4.1-5.1 0-1.2-.8-2.1-2-2.1z"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export function openRepository() {
  return openExternal(`https://github.com/${GITHUB_REPO}`);
}
