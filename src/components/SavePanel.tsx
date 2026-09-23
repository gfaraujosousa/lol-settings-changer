import type { Ref } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import type { ProfileIconId } from '../lib/profileIcons';
import type { ProfileKind } from '../lib/profileStore';
import type { PathStatus } from '../lib/types';
import { IconPicker } from './IconPicker';

interface SavePanelProps {
  status: PathStatus;
  busy: boolean;
  profileDataNeedsRecovery: boolean;
  profileName: string;
  profileKind: ProfileKind;
  accountName: string;
  tagText: string;
  profileIconId: ProfileIconId;
  saveNameInputRef: Ref<HTMLInputElement>;
  onProfileNameChange: (value: string) => void;
  onProfileKindChange: (value: ProfileKind) => void;
  onAccountNameChange: (value: string) => void;
  onTagTextChange: (value: string) => void;
  onProfileIconIdChange: (value: ProfileIconId) => void;
  onSaveCurrentProfile: () => void;
  busyLabel: (key: string, idle: string) => string;
}

export function SavePanel({
  status,
  busy,
  profileDataNeedsRecovery,
  profileName,
  profileKind,
  accountName,
  tagText,
  profileIconId,
  saveNameInputRef,
  onProfileNameChange,
  onProfileKindChange,
  onAccountNameChange,
  onTagTextChange,
  onProfileIconIdChange,
  onSaveCurrentProfile,
  busyLabel,
}: SavePanelProps) {
  const { messages } = useLocale();

  return (
    <section className="panel-card save-panel">
      <div className="section-heading">
        <h2>{messages.save.title}</h2>
        <span>{status.kind === 'valid' ? messages.file.ready : messages.file.needsFile}</span>
      </div>

      <div className="profile-form">
        <label>
          <span>{messages.common.name}</span>
          <input
            ref={saveNameInputRef}
            value={profileName}
            disabled={busy}
            onChange={(event) => onProfileNameChange(event.target.value)}
          />
        </label>
        <label>
          <span>{messages.common.type}</span>
          <select
            value={profileKind}
            disabled={busy}
            onChange={(event) => onProfileKindChange(event.target.value as ProfileKind)}
          >
            <option value="shared">{messages.common.shared}</option>
            <option value="account">{messages.common.account}</option>
          </select>
        </label>
        {profileKind === 'account' ? (
          <label>
            <span>{messages.common.account}</span>
            <input value={accountName} disabled={busy} onChange={(event) => onAccountNameChange(event.target.value)} />
          </label>
        ) : null}
        <label className="icon-picker-field">
          <span>{messages.common.icon}</span>
          <IconPicker value={profileIconId} disabled={busy} onChange={onProfileIconIdChange} />
        </label>
        <label>
          <span>{messages.common.tags}</span>
          <input
            value={tagText}
            disabled={busy}
            placeholder={messages.common.optionalTags}
            onChange={(event) => onTagTextChange(event.target.value)}
          />
        </label>
      </div>

      <div className="actions">
        <button
          type="button"
          className="stamp-button stamp-button-gold"
          onClick={onSaveCurrentProfile}
          disabled={busy || status.kind !== 'valid' || profileDataNeedsRecovery}
        >
          {busyLabel('save-profile', messages.save.action)}
        </button>
      </div>
    </section>
  );
}
