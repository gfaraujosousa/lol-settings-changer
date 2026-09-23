import { useEffect, useState } from 'react';
import { interpolate, useLocale } from '../i18n/LocaleContext';
import { APP_VERSION } from '../i18n/locales';
import type { AvailableUpdate } from '../lib/appUpdate';
import { formatDate } from '../lib/formatDate';
import { fetchGithubChangelog, type ChangelogRelease } from '../lib/githubChangelog';
import { openRepository } from './KofiButton';

export function ChangelogTab({
  update,
  checking,
  installing,
  onCheck,
  onInstall,
}: {
  update: AvailableUpdate | null;
  checking: boolean;
  installing: boolean;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const { locale, messages } = useLocale();
  const [items, setItems] = useState<ChangelogRelease[]>([]);
  const [source, setSource] = useState<'releases' | 'commits' | 'local'>('local');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchGithubChangelog().then((result) => {
      if (cancelled) {
        return;
      }
      setItems(result.releases);
      setSource(result.source);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const heading = source === 'commits' ? messages.news.commits : messages.news.releases;

  return (
    <section className="tab-page changelog-page">
      <div className="section-heading">
        <h2>{messages.news.title}</h2>
        <div className="actions">
          <button type="button" className="stamp-button stamp-button-outline" onClick={onCheck} disabled={checking || installing}>
            {checking ? messages.update.checking : messages.update.check}
          </button>
          <button type="button" className="stamp-button stamp-button-outline" onClick={() => void openRepository()}>
            {messages.news.openRepo}
          </button>
        </div>
      </div>
      <p className="path-hint">{interpolate(messages.update.version, { version: APP_VERSION })}</p>
      {update ? (
        <div className="confirm-box">
          <strong>{interpolate(messages.update.available, { version: update.latest })}</strong>
          <span>{update.name}</span>
          <div className="actions">
            <button type="button" className="stamp-button stamp-button-gold" onClick={onInstall} disabled={installing}>
              {installing ? messages.update.installing : messages.update.install}
            </button>
          </div>
        </div>
      ) : null}
      <p className="path-hint">{messages.news.lead}</p>
      {loading ? <p className="empty-state">{messages.news.loading}</p> : null}
      {error && !loading ? <p className="empty-state">{messages.news.error}</p> : null}
      {!loading && items.length === 0 ? <p className="empty-state">{messages.news.empty}</p> : null}
      {!loading && items.length > 0 ? (
        <div className="changelog-list">
          <p className="changelog-source">{heading}</p>
          {items.map((item) => (
            <article className="changelog-card" key={item.id}>
              <div className="activity-row-top">
                <span className="activity-action">{item.source === 'local' ? messages.news.local : item.tag}</span>
                {item.publishedAt ? <time>{formatDate(item.publishedAt, locale)}</time> : null}
              </div>
              <strong>{item.name}</strong>
              {item.body ? <pre className="changelog-body">{item.body}</pre> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
