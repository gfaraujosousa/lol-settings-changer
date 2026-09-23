import { useLocale } from '../i18n/LocaleContext';
import { formatDate } from '../lib/formatDate';
import type { ActivityEntry } from '../lib/activityStore';
import type { BackupRecord } from '../lib/backupStore';
import type { UserMessage } from '../lib/userMessages';

interface RecoveredStore {
  storePath: string;
  preservedPath?: string | null;
}

function activityTooltip(entry: ActivityEntry): string {
  return [entry.title, entry.message, entry.profileName, entry.backupPath, entry.targetPath]
    .filter(Boolean)
    .join('\n');
}

interface JobSidebarProps {
  path: string;
  busy: boolean;
  backups: BackupRecord[];
  pendingRestore: BackupRecord | null;
  onSelectRestore: (path: string) => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
  activityRows: ActivityEntry[];
  activityStorageWarning: UserMessage | null;
  activityDataNeedsRecovery: boolean;
  activityRecoveryResult: RecoveredStore | null;
  onRecoverActivity: () => void;
  onDismissActivityRecovery: () => void;
  busyLabel: (key: string, idle: string) => string;
}

export function JobSidebar({
  path,
  busy,
  backups,
  pendingRestore,
  onSelectRestore,
  onConfirmRestore,
  onCancelRestore,
  activityRows,
  activityStorageWarning,
  activityDataNeedsRecovery,
  activityRecoveryResult,
  onRecoverActivity,
  onDismissActivityRecovery,
  busyLabel,
}: JobSidebarProps) {
  const { locale, messages } = useLocale();

  function activityActionLabel(action: ActivityEntry['action']): string {
    switch (action) {
      case 'save_profile':
        return messages.activity.save;
      case 'apply_profile':
        return messages.activity.apply;
      case 'restore_backup':
        return messages.activity.restore;
    }
  }

  return (
    <aside className="history-grid">
      <section className="panel-card backup-panel">
        <div className="section-heading">
          <h2>{messages.backup.title}</h2>
          <span>{backups.length}</span>
        </div>

        {backups.length === 0 ? (
          <p className="empty-state">{messages.backup.empty}</p>
        ) : (
          <div className="backup-list">
            {backups.map((backup) => (
              <button
                className="backup-row"
                type="button"
                key={backup.path}
                disabled={busy}
                onClick={() => onSelectRestore(backup.path)}
              >
                <strong>{formatDate(backup.createdAt, locale)}</strong>
                <small className="truncate-path" title={backup.path}>
                  {backup.path}
                </small>
              </button>
            ))}
          </div>
        )}

        {pendingRestore ? (
          <div className="confirm-box">
            <strong>{messages.backup.restoreTitle}</strong>
            <span>
              {messages.backup.title}: {formatDate(pendingRestore.createdAt, locale)}
            </span>
            <span>
              {messages.dossier.target}: {path}
            </span>
            <span>{messages.backup.restoreHint}</span>
            <div className="actions">
              <button type="button" className="stamp-button stamp-button-ink" onClick={onConfirmRestore} disabled={busy}>
                {busyLabel('confirm-restore', messages.backup.confirm)}
              </button>
              <button type="button" className="stamp-button stamp-button-outline" onClick={onCancelRestore} disabled={busy}>
                {messages.common.cancel}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel-card activity-panel">
        <div className="section-heading">
          <h2>{messages.activity.title}</h2>
          <span>{activityRows.length}</span>
        </div>

        {activityStorageWarning ? (
          <div className="activity-warning">
            <strong>{activityStorageWarning.title}</strong>
            <span>{activityStorageWarning.action}</span>
          </div>
        ) : null}

        {activityDataNeedsRecovery ? (
          <div className="recovery-callout">
            <strong>{messages.activity.needsRecovery}</strong>
            <span>{messages.activity.needsRecoveryBody}</span>
            <button type="button" className="stamp-button stamp-button-gold" onClick={onRecoverActivity} disabled={busy}>
              {busyLabel('recover-activity', messages.activity.recover)}
            </button>
          </div>
        ) : activityRecoveryResult ? (
          <div className="recovery-callout recovery-callout-success">
            <strong>{messages.activity.recovered}</strong>
            <span>
              {activityRecoveryResult.preservedPath
                ? messages.activity.recoveredPreserved
                : messages.activity.recoveredFresh}
            </span>
            {activityRecoveryResult.preservedPath ? (
              <small className="truncate-path" title={activityRecoveryResult.preservedPath}>
                {activityRecoveryResult.preservedPath}
              </small>
            ) : null}
            <button type="button" className="stamp-button stamp-button-outline" onClick={onDismissActivityRecovery}>
              {messages.common.ok}
            </button>
          </div>
        ) : null}

        {!activityDataNeedsRecovery && activityRows.length === 0 ? (
          <p className="empty-state">{messages.activity.empty}</p>
        ) : null}

        {!activityDataNeedsRecovery && activityRows.length > 0 ? (
          <div className="activity-list">
            {activityRows.map((entry) => (
              <article
                className={`activity-row activity-row-${entry.status}`}
                key={entry.id}
                title={activityTooltip(entry)}
              >
                <div className="activity-row-top">
                  <span className="activity-action">
                    {activityActionLabel(entry.action)}
                    {entry.profileName ? ` · ${entry.profileName}` : ''}
                  </span>
                  <time>{formatDate(entry.occurredAt, locale)}</time>
                </div>
                {entry.status === 'failure' ? <p>{entry.title}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
