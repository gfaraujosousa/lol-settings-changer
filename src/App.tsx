import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { BrowserKeyValueStore, loadSelectedPath, saveSelectedPath } from './lib/configPath';
import { SETTINGS_FILE_NAME } from './lib/pathUtils';
import type { ActivityEntry, ActivityIndexAdapter, ActivityStoreResult } from './lib/activityStore';
import { appendActivityEntry, loadActivity } from './lib/activityStore';
import type { ProfileIndexAdapter, ProfileKind, ProfileStoreResult, SettingsProfile } from './lib/profileStore';
import {
  createProfile,
  deleteProfile,
  describeProfile,
  groupProfiles,
  isRecoverableProfileIndexError,
  loadProfiles,
  renameSavedProfile,
  saveProfile,
} from './lib/profileStore';
import type { BackupRecord } from './lib/backupStore';
import type { PathStatus } from './lib/types';
import { systemClock } from './lib/types';
import type { ProfileActionResult } from './lib/profileActions';
import {
  activityDetailsForApplyResult,
  activityDetailsForRestoreResult,
  activityDetailsForSaveResult,
  messageForActivityStoreResult,
  messageForApplyResult,
  messageForLocalStoreRecoveryPrompt,
  messageForLocalStoreRecoverySuccess,
  messageForPathStatus,
  messageForProfileDeleteResult,
  messageForProfileRenameResult,
  messageForProfileStoreResult,
  messageForRestoreResult,
  type UserMessage,
} from './lib/userMessages';

type ProfileStoreFailure = Extract<ProfileStoreResult<unknown>, { ok: false }>;
type ActivityStoreFailure = Extract<ActivityStoreResult<unknown>, { ok: false }>;

interface RecoveredStore {
  storePath: string;
  preservedPath?: string | null;
}

class TauriProfileIndexAdapter implements ProfileIndexAdapter {
  async loadIndex(): Promise<string | null> {
    return invoke<string | null>('load_profile_index');
  }

  async saveIndex(contents: string): Promise<void> {
    await invoke('save_profile_index', { index: JSON.parse(contents) });
  }
}

class TauriActivityIndexAdapter implements ActivityIndexAdapter {
  async loadIndex(): Promise<string | null> {
    return invoke<string | null>('load_activity_index');
  }

  async saveIndex(contents: string): Promise<void> {
    await invoke('save_activity_index', { index: JSON.parse(contents) });
  }
}

async function validateViaTauri(path: string | null): Promise<PathStatus> {
  if (!path) {
    return { kind: 'not_selected', path: null };
  }

  return invoke<PathStatus>('validate_settings_path', { path });
}

async function detectViaTauri(): Promise<string | null> {
  return invoke<string | null>('detect_default_settings_path');
}

function makeProfileId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}`;
}

function makeActivityId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `activity-${Date.now()}`;
}

function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function activityActionLabel(action: ActivityEntry['action']): string {
  switch (action) {
    case 'save_profile':
      return 'Save profile';
    case 'apply_profile':
      return 'Apply profile';
    case 'restore_backup':
      return 'Restore backup';
  }
}

function formatFriendlyCode(code: string): string {
  return code.replace(/_/g, ' ');
}

function ProfileButton({
  profile,
  selected,
  onSelect,
}: {
  profile: SettingsProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  const descriptor = describeProfile(profile);

  return (
    <button
      className={`profile-row${selected ? ' profile-row-selected' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span>
        <strong>{profile.name}</strong>
        <small>{descriptor.freeformTags.length ? descriptor.freeformTags.join(', ') : 'No extra tags'}</small>
      </span>
    </button>
  );
}

export default function App() {
  const store = useMemo(() => new BrowserKeyValueStore(), []);
  const profileAdapter = useMemo(() => new TauriProfileIndexAdapter(), []);
  const activityAdapter = useMemo(() => new TauriActivityIndexAdapter(), []);
  const [path, setPath] = useState<string>('');
  const [status, setStatus] = useState<PathStatus>({ kind: 'not_selected', path: null });
  const [profiles, setProfiles] = useState<SettingsProfile[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [profileStoreError, setProfileStoreError] = useState<ProfileStoreFailure | null>(null);
  const [activityStoreError, setActivityStoreError] = useState<ActivityStoreFailure | null>(null);
  const [profileRecoveryResult, setProfileRecoveryResult] = useState<RecoveredStore | null>(null);
  const [activityRecoveryResult, setActivityRecoveryResult] = useState<RecoveredStore | null>(null);
  const [activityStorageWarning, setActivityStorageWarning] = useState<UserMessage | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileKind, setProfileKind] = useState<ProfileKind>('shared');
  const [accountName, setAccountName] = useState('');
  const [tagText, setTagText] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [pendingApplyId, setPendingApplyId] = useState('');
  const [pendingRestorePath, setPendingRestorePath] = useState('');
  const [editingProfileId, setEditingProfileId] = useState('');
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<ProfileKind>('shared');
  const [editAccountName, setEditAccountName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<UserMessage | null>(null);

  const groupedProfiles = useMemo(() => groupProfiles(profiles), [profiles]);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedDescriptor = selectedProfile ? describeProfile(selectedProfile) : null;
  const pendingApplyProfile = profiles.find((profile) => profile.id === pendingApplyId) ?? null;
  const pendingRestore = backups.find((backup) => backup.path === pendingRestorePath) ?? null;
  const editingSelectedProfile = Boolean(selectedProfile && editingProfileId === selectedProfile.id);
  const profileDataNeedsRecovery = Boolean(profileStoreError && isRecoverableProfileIndexError(profileStoreError));
  const activityDataNeedsRecovery = Boolean(activityStoreError?.recoverable);
  const activityRows = useMemo(
    () =>
      [...activityEntries].sort((left, right) => {
        const leftTime = new Date(left.occurredAt).getTime();
        const rightTime = new Date(right.occurredAt).getTime();
        return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
      }),
    [activityEntries],
  );

  function updateProfiles(nextProfiles: SettingsProfile[], preferredId = selectedProfileId) {
    setProfiles(nextProfiles);
    setSelectedProfileId((current) => {
      const candidate = preferredId || current;
      if (candidate && nextProfiles.some((profile) => profile.id === candidate)) {
        return candidate;
      }
      return nextProfiles[0]?.id ?? '';
    });
  }

  async function refreshProfiles() {
    const result = await loadProfiles(profileAdapter);
    if (result.ok) {
      setProfileStoreError(null);
      updateProfiles(result.value.profiles);
    } else {
      setProfiles([]);
      setSelectedProfileId('');
      setPendingApplyId('');
      setEditingProfileId('');
      setProfileStoreError(result);
      setActionMessage(
        isRecoverableProfileIndexError(result)
          ? messageForLocalStoreRecoveryPrompt('profiles')
          : messageForProfileStoreResult(result),
      );
    }
  }

  async function refreshActivity() {
    const result = await loadActivity(activityAdapter);
    if (result.ok) {
      setActivityEntries(result.value.entries);
      setActivityStoreError(null);
      setActivityStorageWarning(null);
    } else {
      setActivityEntries([]);
      setActivityStoreError(result);
      setActivityStorageWarning(messageForActivityStoreResult(result));
    }
  }

  async function recordActivity(entry: Omit<ActivityEntry, 'id' | 'occurredAt'>) {
    if (activityStoreError) {
      setActivityStorageWarning(messageForActivityStoreResult(activityStoreError));
      return;
    }

    const result = await appendActivityEntry(activityAdapter, {
      id: makeActivityId(),
      occurredAt: systemClock.now().toISOString(),
      ...entry,
    });

    if (result.ok) {
      setActivityEntries(result.value.entries);
      setActivityStoreError(null);
      setActivityStorageWarning(null);
      return;
    }

    if (result.recoverable) {
      setActivityEntries([]);
      setActivityStoreError(result);
    }
    setActivityStorageWarning(messageForActivityStoreResult(result));
  }

  async function refreshBackups(nextPath = path, nextStatus = status) {
    if (nextStatus.kind !== 'valid' || !nextPath) {
      setBackups([]);
      return;
    }

    const nextBackups = await invoke<BackupRecord[]>('list_settings_backups', { targetPath: nextPath });
    setBackups(nextBackups);
  }

  async function checkPath(nextPath = path) {
    setBusy(true);
    try {
      const result = await validateViaTauri(nextPath || null);
      setStatus(result);
      await refreshBackups(nextPath, result);
    } catch {
      const fallback: PathStatus = nextPath ? { kind: 'missing', path: nextPath } : { kind: 'not_selected', path: null };
      setStatus(fallback);
      setBackups([]);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'League settings', extensions: ['json'] }],
    });

    if (typeof selected === 'string') {
      setPath(selected);
      await saveSelectedPath(store, selected);
      await checkPath(selected);
    }
  }

  async function saveCurrentProfile() {
    if (profileDataNeedsRecovery) {
      setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      return;
    }

    if (status.kind !== 'valid' || !path) {
      const message: UserMessage = {
        title: 'Settings file is not ready.',
        action: 'Select a valid PersistedSettings.json before saving a profile.',
        tone: 'error',
      };
      setActionMessage(message);
      await recordActivity({
        action: 'save_profile',
        status: 'failure',
        title: message.title,
        message: message.action,
        friendlyCode: 'save_profile_failed',
      });
      return;
    }

    setBusy(true);
    try {
      let settingsJson: string;
      try {
        settingsJson = await invoke<string>('read_settings_file', { path });
      } catch {
        const message: UserMessage = {
          title: 'Settings file could not be read.',
          action: 'Select a valid PersistedSettings.json and try again.',
          tone: 'error',
        };
        setActionMessage(message);
        await recordActivity({
          action: 'save_profile',
          status: 'failure',
          title: message.title,
          message: message.action,
          friendlyCode: 'save_profile_failed',
        });
        return;
      }

      const structuralTag = profileKind === 'shared' ? 'shared' : `account:${accountName.trim()}`;
      const profile = createProfile(
        {
          name: profileName,
          tags: [structuralTag, ...splitTags(tagText)],
          settingsJson,
        },
        { clock: systemClock, idFactory: makeProfileId },
      );

      if (!profile.ok) {
        const message = messageForProfileStoreResult(profile);
        const details = activityDetailsForSaveResult(profile);
        setActionMessage(message);
        await recordActivity({
          action: 'save_profile',
          status: 'failure',
          title: details.title,
          message: details.message,
          friendlyCode: details.friendlyCode,
        });
        return;
      }

      const saved = await saveProfile(profileAdapter, profile.value);
      const message = messageForProfileStoreResult(saved);
      const details = activityDetailsForSaveResult(saved);
      setActionMessage(message);
      await recordActivity({
        action: 'save_profile',
        status: saved.ok ? 'success' : 'failure',
        title: details.title,
        message: details.message,
        friendlyCode: details.friendlyCode,
        profileId: profile.value.id,
        profileName: profile.value.name,
      });
      if (saved.ok) {
        setProfileStoreError(null);
        updateProfiles(saved.value.profiles, profile.value.id);
        setProfileName('');
        setAccountName('');
        setTagText('');
      } else if (isRecoverableProfileIndexError(saved)) {
        setProfileStoreError(saved);
      }
    } finally {
      setBusy(false);
    }
  }

  function beginEditProfile(profile: SettingsProfile) {
    const descriptor = describeProfile(profile);
    setEditingProfileId(profile.id);
    setEditName(profile.name);
    setEditKind(descriptor.kind);
    setEditAccountName(descriptor.accountName ?? '');
    setEditTags(descriptor.freeformTags.join(', '));
    setDeleteText('');
  }

  async function saveProfileEdits() {
    if (profileDataNeedsRecovery) {
      setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      return;
    }

    if (!selectedProfile) {
      return;
    }

    const structuralTag = editKind === 'shared' ? 'shared' : `account:${editAccountName.trim()}`;
    setBusy(true);
    try {
      const result = await renameSavedProfile(
        profileAdapter,
        selectedProfile.id,
        {
          name: editName,
          structuralTag,
          freeformTags: splitTags(editTags),
        },
        { clock: systemClock },
      );
      setActionMessage(messageForProfileRenameResult(result));
      if (result.ok) {
        setProfileStoreError(null);
        updateProfiles(result.value.profiles, selectedProfile.id);
        setEditingProfileId('');
      } else if (isRecoverableProfileIndexError(result)) {
        setProfileStoreError(result);
        setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteProfile() {
    if (profileDataNeedsRecovery) {
      setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      return;
    }

    if (!selectedProfile) {
      return;
    }

    setBusy(true);
    try {
      const result = await deleteProfile(profileAdapter, selectedProfile.id, deleteText);
      setActionMessage(messageForProfileDeleteResult(result));
      if (result.ok) {
        setProfileStoreError(null);
        const currentIndex = profiles.findIndex((profile) => profile.id === selectedProfile.id);
        const nextSelected = result.value.profiles[currentIndex] ?? result.value.profiles[currentIndex - 1];
        updateProfiles(result.value.profiles, nextSelected?.id ?? '');
        setEditingProfileId('');
        setDeleteText('');
        setPendingApplyId('');
      } else if (isRecoverableProfileIndexError(result)) {
        setProfileStoreError(result);
        setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmApplyProfile() {
    if (profileDataNeedsRecovery) {
      setActionMessage(messageForLocalStoreRecoveryPrompt('profiles'));
      return;
    }

    if (!pendingApplyProfile || !path) {
      return;
    }

    try {
      JSON.parse(pendingApplyProfile.settingsJson);
    } catch (cause) {
      const result: ProfileActionResult = {
        ok: false,
        code: 'invalid_profile_json',
        message: 'Profile settings are invalid.',
        cause,
      };
      const message = messageForApplyResult(result);
      const details = activityDetailsForApplyResult(result);
      setActionMessage(message);
      await recordActivity({
        action: 'apply_profile',
        status: 'failure',
        title: details.title,
        message: details.message,
        friendlyCode: details.friendlyCode,
        profileId: pendingApplyProfile.id,
        profileName: pendingApplyProfile.name,
      });
      return;
    }

    setBusy(true);
    try {
      const result = await invoke<ProfileActionResult>('apply_settings_profile', {
        targetPath: path,
        settingsJson: pendingApplyProfile.settingsJson,
      });
      const message = messageForApplyResult(result);
      const details = activityDetailsForApplyResult(result);
      setActionMessage(message);
      await recordActivity({
        action: 'apply_profile',
        status: result.ok ? 'success' : 'failure',
        title: details.title,
        message: details.message,
        friendlyCode: details.friendlyCode,
        profileId: pendingApplyProfile.id,
        profileName: pendingApplyProfile.name,
        targetPath: path,
        backupPath: result.ok ? result.backup.path : result.backupPath,
      });
      setPendingApplyId('');
      await checkPath(path);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestoreBackup() {
    if (!pendingRestore || !path) {
      return;
    }

    setBusy(true);
    try {
      const result = await invoke<ProfileActionResult>('restore_settings_backup', {
        targetPath: path,
        backupPath: pendingRestore.path,
      });
      const message = messageForRestoreResult(result);
      const details = activityDetailsForRestoreResult(result);
      setActionMessage(message);
      await recordActivity({
        action: 'restore_backup',
        status: result.ok ? 'success' : 'failure',
        title: details.title,
        message: details.message,
        friendlyCode: details.friendlyCode,
        targetPath: path,
        backupPath: result.ok ? result.backup.path : result.backupPath ?? pendingRestore.path,
      });
      setPendingRestorePath('');
      await checkPath(path);
    } finally {
      setBusy(false);
    }
  }

  async function recoverProfileStore() {
    setBusy(true);
    try {
      const result = await invoke<RecoveredStore>('recover_profile_index');
      setProfileRecoveryResult(result);
      setActionMessage(messageForLocalStoreRecoverySuccess('profiles', result.preservedPath));
      setPendingApplyId('');
      setEditingProfileId('');
      setDeleteText('');
      await refreshProfiles();
    } catch {
      setActionMessage({
        title: 'Saved profiles were not recovered.',
        action: 'No profile files were replaced. Try recovery again.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function recoverActivityStore() {
    setBusy(true);
    try {
      const result = await invoke<RecoveredStore>('recover_activity_index');
      setActivityRecoveryResult(result);
      setActionMessage(messageForLocalStoreRecoverySuccess('activity', result.preservedPath));
      await refreshActivity();
    } catch {
      setActionMessage({
        title: 'Activity was not recovered.',
        action: 'No activity files were replaced. Try recovery again.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    async function initialize() {
      await refreshProfiles();
      await refreshActivity();
      const stored = await loadSelectedPath(store);
      const detected = stored ?? (await detectViaTauri().catch(() => null));
      if (detected) {
        setPath(detected);
        await checkPath(detected);
      }
    }

    void initialize();
  }, [store]);

  const pathMessage = messageForPathStatus(status);
  const visibleMessage = actionMessage ?? activityStorageWarning ?? pathMessage;

  return (
    <main className="shell">
      <section className="panel">
        <div className="top-bar">
          <div className="heading">
            <p className="eyebrow">League of Legends</p>
            <h1>Settings profiles</h1>
          </div>
          <div className={`status status-${visibleMessage.tone}`}>
            <strong>{visibleMessage.title}</strong>
            <span>{visibleMessage.action}</span>
          </div>
        </div>

        <section className="path-strip">
          <label className="path-field">
            <span>Selected file</span>
            <input
              value={path}
              placeholder={`Select ${SETTINGS_FILE_NAME}`}
              onChange={(event) => setPath(event.target.value)}
              onBlur={() => saveSelectedPath(store, path)}
            />
          </label>

          <div className="actions">
            <button type="button" onClick={chooseFile} disabled={busy}>
              Select file
            </button>
            <button type="button" onClick={() => checkPath()} disabled={busy}>
              Re-check
            </button>
          </div>
        </section>

        {profileDataNeedsRecovery ? (
          <section className="recovery-panel recovery-panel-priority">
            <div>
              <h2>Saved profiles need recovery</h2>
              <p>The damaged profile list will be preserved before a fresh empty list is created.</p>
            </div>
            <button type="button" onClick={recoverProfileStore} disabled={busy}>
              Recover saved profiles
            </button>
          </section>
        ) : profileRecoveryResult ? (
          <section className="recovery-panel">
            <div>
              <h2>Saved profiles recovered</h2>
              <p>
                {profileRecoveryResult.preservedPath
                  ? 'The damaged profile list was preserved before reset.'
                  : 'A fresh profile list was created.'}
              </p>
              {profileRecoveryResult.preservedPath ? <small>{profileRecoveryResult.preservedPath}</small> : null}
            </div>
          </section>
        ) : null}

        <div className="dashboard-grid">
          <section className="profile-browser">
            <div className="section-heading">
              <h2>Saved profiles</h2>
              <span>{profiles.length}</span>
            </div>

            <div className="profile-section">
              <div className="profile-section-title">
                <h3>Shared</h3>
                <span>{groupedProfiles.shared.length}</span>
              </div>
              {groupedProfiles.shared.length === 0 ? (
                <p className="empty-state">No shared profiles saved.</p>
              ) : (
                <div className="profile-list">
                  {groupedProfiles.shared.map((profile) => (
                    <ProfileButton
                      key={profile.id}
                      profile={profile}
                      selected={selectedProfileId === profile.id}
                      onSelect={() => {
                        setSelectedProfileId(profile.id);
                        setEditingProfileId('');
                        setDeleteText('');
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="profile-section">
              <div className="profile-section-title">
                <h3>Accounts</h3>
                <span>{groupedProfiles.accounts.length}</span>
              </div>
              {groupedProfiles.accounts.length === 0 ? (
                <p className="empty-state">No account profiles saved.</p>
              ) : (
                <div className="account-list">
                  {groupedProfiles.accounts.map((group) => (
                    <div className="account-group" key={group.structuralTag}>
                      <div className="account-heading">
                        <strong>{group.accountName}</strong>
                        <small>{group.profiles.length}</small>
                      </div>
                      <div className="profile-list">
                        {group.profiles.map((profile) => (
                          <ProfileButton
                            key={profile.id}
                            profile={profile}
                            selected={selectedProfileId === profile.id}
                            onSelect={() => {
                              setSelectedProfileId(profile.id);
                              setEditingProfileId('');
                              setDeleteText('');
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="details-panel">
            <div className="section-heading">
              <h2>Profile details</h2>
              <span>{selectedDescriptor?.kind === 'account' ? 'Account' : 'Shared'}</span>
            </div>

            {!selectedProfile || !selectedDescriptor ? (
              <p className="empty-state">Select a saved profile to manage it.</p>
            ) : (
              <div className="details-stack">
                <div className="profile-summary">
                  <h3>{selectedProfile.name}</h3>
                  <div className="tag-list">
                    <span className="tag-pill">{selectedDescriptor.structuralTag}</span>
                    {selectedDescriptor.freeformTags.map((tag) => (
                      <span className="tag-pill tag-pill-muted" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <dl className="metadata-list">
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDate(selectedProfile.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDate(selectedProfile.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="actions">
                  <button
                    type="button"
                    disabled={busy || status.kind !== 'valid' || profileDataNeedsRecovery}
                    onClick={() => setPendingApplyId(selectedProfile.id)}
                  >
                    Review apply
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEditProfile(selectedProfile)}
                    disabled={busy || profileDataNeedsRecovery}
                  >
                    Edit
                  </button>
                </div>

                {pendingApplyProfile?.id === selectedProfile.id ? (
                  <div className="confirm-box">
                    <strong>Apply {pendingApplyProfile.name}?</strong>
                    <span>Type: {describeProfile(pendingApplyProfile).structuralTag}</span>
                    <span>Target: {path}</span>
                    <span>Backup: A backup will be created before writing.</span>
                    <div className="actions">
                      <button type="button" onClick={confirmApplyProfile} disabled={busy || profileDataNeedsRecovery}>
                        Confirm apply
                      </button>
                      <button type="button" onClick={() => setPendingApplyId('')} disabled={busy}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {editingSelectedProfile ? (
                  <div className="edit-panel">
                    <div className="profile-form">
                      <label>
                        <span>Name</span>
                        <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                      </label>
                      <label>
                        <span>Type</span>
                        <select
                          value={editKind}
                          onChange={(event) => setEditKind(event.target.value as ProfileKind)}
                        >
                          <option value="shared">Shared</option>
                          <option value="account">Account</option>
                        </select>
                      </label>
                      {editKind === 'account' ? (
                        <label>
                          <span>Account</span>
                          <input value={editAccountName} onChange={(event) => setEditAccountName(event.target.value)} />
                        </label>
                      ) : null}
                      <label>
                        <span>Tags</span>
                        <input
                          value={editTags}
                          placeholder="optional, comma-separated"
                          onChange={(event) => setEditTags(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="actions">
                      <button type="button" onClick={saveProfileEdits} disabled={busy || profileDataNeedsRecovery}>
                        Save changes
                      </button>
                      <button type="button" onClick={() => setEditingProfileId('')} disabled={busy}>
                        Cancel
                      </button>
                    </div>

                    <div className="danger-zone">
                      <strong>Delete profile</strong>
                      <span>Type {selectedProfile.name} to remove only this saved profile entry.</span>
                      <input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
                      <button type="button" onClick={confirmDeleteProfile} disabled={busy || profileDataNeedsRecovery}>
                        Delete profile
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <aside className="side-stack">
            <section className="save-panel">
              <div className="section-heading">
                <h2>Save current</h2>
                <span>{status.kind === 'valid' ? 'Ready' : 'Needs file'}</span>
              </div>

              <div className="profile-form profile-form-single">
                <label>
                  <span>Name</span>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={profileKind} onChange={(event) => setProfileKind(event.target.value as ProfileKind)}>
                    <option value="shared">Shared</option>
                    <option value="account">Account</option>
                  </select>
                </label>
                {profileKind === 'account' ? (
                  <label>
                    <span>Account</span>
                    <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                  </label>
                ) : null}
                <label>
                  <span>Tags</span>
                  <input
                    value={tagText}
                    placeholder="optional, comma-separated"
                    onChange={(event) => setTagText(event.target.value)}
                  />
                </label>
              </div>

              <div className="actions">
                <button
                  type="button"
                  onClick={saveCurrentProfile}
                  disabled={busy || status.kind !== 'valid' || profileDataNeedsRecovery}
                >
                  Save profile
                </button>
              </div>
            </section>

            <section className="backup-panel">
              <div className="section-heading">
                <h2>Recent backups</h2>
                <span>{backups.length}</span>
              </div>

              {backups.length === 0 ? (
                <p className="empty-state">No backups for the selected file yet.</p>
              ) : (
                <div className="backup-list">
                  {backups.map((backup) => (
                    <button
                      className="backup-row"
                      type="button"
                      key={backup.path}
                      onClick={() => setPendingRestorePath(backup.path)}
                    >
                      <strong>{formatDate(backup.createdAt)}</strong>
                      <small>{backup.path}</small>
                    </button>
                  ))}
                </div>
              )}

              {pendingRestore ? (
                <div className="confirm-box">
                  <strong>Restore this backup?</strong>
                  <span>Backup: {formatDate(pendingRestore.createdAt)}</span>
                  <span>Target: {path}</span>
                  <span>Current settings will be backed up first.</span>
                  <div className="actions">
                    <button type="button" onClick={confirmRestoreBackup} disabled={busy}>
                      Confirm restore
                    </button>
                    <button type="button" onClick={() => setPendingRestorePath('')} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="activity-panel">
              <div className="section-heading">
                <h2>Activity</h2>
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
                  <strong>Activity needs recovery</strong>
                  <span>The damaged activity file will be preserved before a fresh empty list is created.</span>
                  <button type="button" onClick={recoverActivityStore} disabled={busy}>
                    Recover activity
                  </button>
                </div>
              ) : activityRecoveryResult ? (
                <div className="recovery-callout recovery-callout-success">
                  <strong>Activity recovered</strong>
                  <span>
                    {activityRecoveryResult.preservedPath
                      ? 'The damaged activity file was preserved before reset.'
                      : 'A fresh activity list was created.'}
                  </span>
                  {activityRecoveryResult.preservedPath ? <small>{activityRecoveryResult.preservedPath}</small> : null}
                </div>
              ) : null}

              {!activityDataNeedsRecovery && activityRows.length === 0 ? (
                <p className="empty-state">No save, apply, or restore activity yet.</p>
              ) : null}

              {!activityDataNeedsRecovery && activityRows.length > 0 ? (
                <div className="activity-list">
                  {activityRows.map((entry) => (
                    <article className={`activity-row activity-row-${entry.status}`} key={entry.id}>
                      <div className="activity-row-top">
                        <span className="activity-action">{activityActionLabel(entry.action)}</span>
                        <time>{formatDate(entry.occurredAt)}</time>
                      </div>
                      <strong>{entry.title}</strong>
                      <p>{entry.message}</p>
                      {entry.friendlyCode ? (
                        <span className="activity-code">Code: {formatFriendlyCode(entry.friendlyCode)}</span>
                      ) : null}
                      {entry.profileName || entry.backupPath || entry.targetPath ? (
                        <dl className="activity-context">
                          {entry.profileName ? (
                            <div>
                              <dt>Profile</dt>
                              <dd>{entry.profileName}</dd>
                            </div>
                          ) : null}
                          {entry.backupPath ? (
                            <div>
                              <dt>Backup</dt>
                              <dd>{entry.backupPath}</dd>
                            </div>
                          ) : null}
                          {entry.targetPath ? (
                            <div>
                              <dt>Target</dt>
                              <dd>{entry.targetPath}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
