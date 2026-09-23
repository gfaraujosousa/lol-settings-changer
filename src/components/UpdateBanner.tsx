import { interpolate, useLocale } from '../i18n/LocaleContext';
import type { AvailableUpdate } from '../lib/appUpdate';

export function UpdateBanner({
  update,
  installing,
  onInstall,
  onLater,
  onSkip,
}: {
  update: AvailableUpdate;
  installing: boolean;
  onInstall: () => void;
  onLater: () => void;
  onSkip: () => void;
}) {
  const { messages } = useLocale();

  return (
    <section className="recovery-panel recovery-panel-priority update-banner">
      <div>
        <h2>{interpolate(messages.update.available, { version: update.latest })}</h2>
        <p>{update.name}</p>
        {update.notes ? <small className="update-notes">{update.notes}</small> : null}
      </div>
      <div className="actions">
        <button type="button" className="stamp-button stamp-button-gold" onClick={onInstall} disabled={installing}>
          {installing ? messages.update.installing : messages.update.install}
        </button>
        <button type="button" className="stamp-button stamp-button-outline" onClick={onLater} disabled={installing}>
          {messages.update.later}
        </button>
        <button type="button" className="stamp-button stamp-button-outline" onClick={onSkip} disabled={installing}>
          {messages.update.skip}
        </button>
      </div>
    </section>
  );
}
