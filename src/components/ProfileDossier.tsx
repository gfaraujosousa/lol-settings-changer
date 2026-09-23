import { interpolate, useLocale } from '../i18n/LocaleContext';
import { formatDate } from '../lib/formatDate';
import { describeProfile } from '../lib/profileStore';
import type { ProfileDescriptor, ProfileKind, SettingsProfile } from '../lib/profileStore';
import type { ProfileIconId } from '../lib/profileIcons';
import type { PathStatus } from '../lib/types';
import { IconPicker } from './IconPicker';
import { ProfileBadge } from './ProfileBadge';

function structuralTagLabel(descriptor: ProfileDescriptor, shared: string, account: string): string {
  if (descriptor.kind === 'shared') {
    return shared;
  }
  return descriptor.accountName ?? account;
}

interface ProfileDossierProps {
  selectedProfile: SettingsProfile | null;
  selectedDescriptor: ProfileDescriptor | null;
  status: PathStatus;
  path: string;
  busy: boolean;
  profileDataNeedsRecovery: boolean;
  pendingApplyProfile: SettingsProfile | null;
  showApplyModal: boolean;
  editingSelectedProfile: boolean;
  editName: string;
  editKind: ProfileKind;
  editAccountName: string;
  editTags: string;
  editIconId: ProfileIconId;
  deleteText: string;
  onApplyClick: () => void;
  onConfirmApply: () => void;
  onCancelApply: () => void;
  onBeginEdit: (profile: SettingsProfile) => void;
  onEditNameChange: (value: string) => void;
  onEditKindChange: (value: ProfileKind) => void;
  onEditAccountNameChange: (value: string) => void;
  onEditTagsChange: (value: string) => void;
  onEditIconIdChange: (value: ProfileIconId) => void;
  onDeleteTextChange: (value: string) => void;
  onSaveEdits: () => void;
  onCancelEdit: () => void;
  onConfirmDelete: () => void;
  busyLabel: (key: string, idle: string) => string;
}

export function ProfileDossier({
  selectedProfile,
  selectedDescriptor,
  status,
  path,
  busy,
  profileDataNeedsRecovery,
  pendingApplyProfile,
  showApplyModal,
  editingSelectedProfile,
  editName,
  editKind,
  editAccountName,
  editTags,
  editIconId,
  deleteText,
  onApplyClick,
  onConfirmApply,
  onCancelApply,
  onBeginEdit,
  onEditNameChange,
  onEditKindChange,
  onEditAccountNameChange,
  onEditTagsChange,
  onEditIconIdChange,
  onDeleteTextChange,
  onSaveEdits,
  onCancelEdit,
  onConfirmDelete,
  busyLabel,
}: ProfileDossierProps) {
  const { locale, messages } = useLocale();
  const applyDescriptor = pendingApplyProfile ? describeProfile(pendingApplyProfile) : null;

  return (
    <section className="panel-card profile-dossier">
      <div className="section-heading">
        <h2>{messages.dossier.title}</h2>
        <span>
          {selectedDescriptor?.kind === 'account'
            ? messages.common.account
            : selectedDescriptor
              ? messages.common.shared
              : '—'}
        </span>
      </div>

      {!selectedProfile || !selectedDescriptor ? (
        <p className="empty-state">{messages.dossier.empty}</p>
      ) : (
        <div className="details-stack">
          <div className="profile-summary">
            <div className="profile-summary-title">
              <ProfileBadge iconId={selectedProfile.iconId} size={44} />
              <h3>{selectedProfile.name}</h3>
            </div>
            <div className="tag-list">
              <span className="tag-pill">
                {structuralTagLabel(selectedDescriptor, messages.common.shared, messages.common.account)}
              </span>
              {selectedDescriptor.freeformTags.map((tag) => (
                <span className="tag-pill tag-pill-muted" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <dl className="metadata-list">
              <div>
                <dt>{messages.dossier.created}</dt>
                <dd>{formatDate(selectedProfile.createdAt, locale)}</dd>
              </div>
              <div>
                <dt>{messages.dossier.updated}</dt>
                <dd>{formatDate(selectedProfile.updatedAt, locale)}</dd>
              </div>
            </dl>
          </div>

          <div className="actions">
            <button
              type="button"
              className="stamp-button stamp-button-ink"
              disabled={busy || status.kind !== 'valid' || profileDataNeedsRecovery}
              onClick={onApplyClick}
            >
              {busyLabel('apply-profile', messages.dossier.apply)}
            </button>
            <button
              type="button"
              className="stamp-button stamp-button-outline"
              onClick={() => onBeginEdit(selectedProfile)}
              disabled={busy || profileDataNeedsRecovery}
            >
              {messages.dossier.edit}
            </button>
          </div>

          {editingSelectedProfile ? (
            <div className="edit-panel">
              <div className="profile-form">
                <label>
                  <span>{messages.common.name}</span>
                  <input value={editName} onChange={(event) => onEditNameChange(event.target.value)} disabled={busy} />
                </label>
                <label>
                  <span>{messages.common.type}</span>
                  <select
                    value={editKind}
                    disabled={busy}
                    onChange={(event) => onEditKindChange(event.target.value as ProfileKind)}
                  >
                    <option value="shared">{messages.common.shared}</option>
                    <option value="account">{messages.common.account}</option>
                  </select>
                </label>
                {editKind === 'account' ? (
                  <label>
                    <span>{messages.common.account}</span>
                    <input
                      value={editAccountName}
                      disabled={busy}
                      onChange={(event) => onEditAccountNameChange(event.target.value)}
                    />
                  </label>
                ) : null}
                <label className="icon-picker-field">
                  <span>{messages.common.icon}</span>
                  <IconPicker value={editIconId} disabled={busy} onChange={onEditIconIdChange} />
                </label>
                <label>
                  <span>{messages.common.tags}</span>
                  <input
                    value={editTags}
                    disabled={busy}
                    placeholder={messages.common.optionalTags}
                    onChange={(event) => onEditTagsChange(event.target.value)}
                  />
                </label>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="stamp-button stamp-button-ink"
                  onClick={onSaveEdits}
                  disabled={busy || profileDataNeedsRecovery}
                >
                  {busyLabel('save-edits', messages.dossier.saveChanges)}
                </button>
                <button type="button" className="stamp-button stamp-button-outline" onClick={onCancelEdit} disabled={busy}>
                  {messages.common.cancel}
                </button>
              </div>

              <div className="danger-zone">
                <strong>{messages.dossier.deleteTitle}</strong>
                <span>{interpolate(messages.dossier.deleteHint, { name: selectedProfile.name })}</span>
                <input value={deleteText} disabled={busy} onChange={(event) => onDeleteTextChange(event.target.value)} />
                <button
                  type="button"
                  className="stamp-button stamp-button-danger"
                  onClick={onConfirmDelete}
                  disabled={busy || profileDataNeedsRecovery}
                >
                  {busyLabel('delete-profile', messages.dossier.delete)}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showApplyModal && pendingApplyProfile && applyDescriptor ? (
        <div className="modal-overlay" role="presentation" onClick={onCancelApply}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="apply-modal-title">{interpolate(messages.dossier.applyTitle, { name: pendingApplyProfile.name })}</h3>
            <div className="modal-details">
              <span>
                {messages.common.type}:{' '}
                {structuralTagLabel(applyDescriptor, messages.common.shared, messages.common.account)}
              </span>
              <span>
                {messages.dossier.target}: {path}
              </span>
              <span>
                {messages.activity.backup}: {messages.dossier.applyBackup}
              </span>
            </div>
            <div className="actions">
              <button
                type="button"
                className="stamp-button stamp-button-ink"
                onClick={onConfirmApply}
                disabled={busy || profileDataNeedsRecovery}
              >
                {busyLabel('confirm-apply', messages.dossier.confirmApply)}
              </button>
              <button type="button" className="stamp-button stamp-button-outline" onClick={onCancelApply} disabled={busy}>
                {messages.common.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
