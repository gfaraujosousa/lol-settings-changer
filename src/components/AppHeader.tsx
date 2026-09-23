import brandLogo from '../assets/brand-logo-1024.png';
import { interpolate, useLocale } from '../i18n/LocaleContext';
import { APP_VERSION } from '../i18n/locales';
import type { PathStatus } from '../lib/types';
import { KofiButton } from './KofiButton';
import { LanguageSelect } from './LanguageSelect';

interface AppHeaderProps {
  status: PathStatus;
  keepInTray: boolean;
  onKeepInTrayChange: (enabled: boolean) => void;
  disabled?: boolean;
  updateAvailable?: boolean;
  updateChecking?: boolean;
  onCheckUpdates?: () => void;
}

export function AppHeader({
  status,
  keepInTray,
  onKeepInTrayChange,
  disabled = false,
  updateAvailable = false,
  updateChecking = false,
  onCheckUpdates,
}: AppHeaderProps) {
  const { locale, messages, setLocale } = useLocale();
  const fileReady = status.kind === 'valid';

  return (
    <header className="app-header">
      <div className="caution-stripe" aria-hidden="true" />
      <svg className="header-horn header-horn-left" viewBox="0 0 48 36" aria-hidden="true">
        <path d="M6 34 C4 16 14 2 22 16 C24 4 38 8 28 34 Z" />
      </svg>
      <svg className="header-horn header-horn-right" viewBox="0 0 48 36" aria-hidden="true">
        <path d="M42 34 C44 16 34 2 26 16 C24 4 10 8 20 34 Z" />
      </svg>

      <div className="app-header-brand">
        <img className="app-header-logo" src={brandLogo} alt="LoL Settings Changer" width={44} height={44} />
        <div className="app-header-title-block">
          <p className="eyebrow">{messages.app.eyebrow}</p>
          <h1 className="hb-wordmark" aria-label="LoL Settings Changer">
            <span className="hb-wordmark-lol">{messages.app.wordmarkLol}</span>
            <span className="hb-wordmark-settings">{messages.app.wordmarkSettings}</span>
            <span className="hb-wordmark-changer">{messages.app.wordmarkChanger}</span>
          </h1>
        </div>
      </div>

      <div className="app-header-controls">
        <span className={`file-chip file-chip-${fileReady ? 'ready' : 'needs-file'}`}>
          {fileReady ? messages.file.ready : messages.file.needsFile}
        </span>

        <button
          type="button"
          className={`file-chip${updateAvailable ? ' file-chip-ready' : ' file-chip-version'}`}
          onClick={onCheckUpdates}
          disabled={disabled || updateChecking || !onCheckUpdates}
          title={messages.update.check}
        >
          {updateChecking
            ? messages.update.checking
            : updateAvailable
              ? messages.update.badge
              : interpolate(messages.update.version, { version: APP_VERSION })}
        </button>

        <label className="tray-toggle">
          <input
            type="checkbox"
            checked={keepInTray}
            disabled={disabled}
            onChange={(event) => onKeepInTrayChange(event.target.checked)}
          />
          <span>{messages.tray.keep}</span>
        </label>

        <LanguageSelect locale={locale} label={messages.lang.label} onChange={setLocale} />
        <KofiButton label={messages.kofi.cta} />
      </div>
    </header>
  );
}
