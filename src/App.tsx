import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { ActionToast } from './components/ActionToast';
import { AppHeader } from './components/AppHeader';
import { ChangelogTab } from './components/ChangelogTab';
import { JobSidebar } from './components/JobSidebar';
import { OnboardingTab } from './components/OnboardingTab';
import { ProfileDossier } from './components/ProfileDossier';
import { ProfileRoster } from './components/ProfileRoster';
import { SavePanel } from './components/SavePanel';
import { isAppTab, TabBar, type AppTab } from './components/TabBar';
import { UpdateBanner } from './components/UpdateBanner';
import { interpolate, useLocale } from './i18n/LocaleContext';
import { ONBOARDING_STORAGE_KEY, TAB_STORAGE_KEY } from './i18n/locales';
import {
  checkAppUpdate,
  skipUpdate,
  startUpdateInstall,
  type AvailableUpdate,
} from './lib/appUpdate';
import { BrowserKeyValueStore, loadSelectedPath, saveSelectedPath } from './lib/configPath';
import { loadKeepInTray, saveKeepInTray } from './lib/idlePref';
import type { ActivityEntry, ActivityIndexAdapter, ActivityStoreResult } from './lib/activityStore';
import { appendActivityEntry, loadActivity } from './lib/activityStore';
import { DEFAULT_PROFILE_ICON_ID, normalizeProfileIconId, type ProfileIconId } from './lib/profileIcons';
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

function busyLabel(busy: boolean, key: string, busyKey: string | null, idle: string, working: string): string {
  return busy && busyKey === key ? working : idle;
}

function readStoredTab(): AppTab {
  try {
    const seen = globalThis.localStorage?.getItem(ONBOARDING_STORAGE_KEY);
    const stored = globalThis.localStorage?.getItem(TAB_STORAGE_KEY);
    if (!seen) {
      return 'start';
    }
    if (isAppTab(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'start';
}

export default function App() {
  const { messages } = useLocale();
  const store = useMemo(() => new BrowserKeyValueStore(), []);
  const profileAdapter = useMemo(() => new TauriProfileIndexAdapter(), []);
  const activityAdapter = useMemo(() => new TauriActivityIndexAdapter(), []);
  const saveNameInputRef = useRef<HTMLInputElement>(null);
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
  const [profileIconId, setProfileIconId] = useState<ProfileIconId>(DEFAULT_PROFILE_ICON_ID);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [pendingApplyId, setPendingApplyId] = useState('');
  const [pendingRestorePath, setPendingRestorePath] = useState('');
  const [editingProfileId, setEditingProfileId] = useState('');
  const [editName, setEditName] = useState('');
  const [editKind, setEditKind] = useState<ProfileKind>('shared');
  const [editAccountName, setEditAccountName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editIconId, setEditIconId] = useState<ProfileIconId>(DEFAULT_PROFILE_ICON_ID);
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [keepInTray, setKeepInTray] = useState(false);
  const [actionMessage, setActionMessage] = useState<UserMessage | null>(null);
  const [tab, setTab] = useState<AppTab>(readStoredTab);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);

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

  const labelBusy = useCallback(
    (key: string, idle: string) => busyLabel(busy, key, busyKey, idle, messages.busy.working),
    [busy, busyKey, messages.busy.working],
  );

  function changeTab(next: AppTab) {
    setTab(next);
    try {
      globalThis.localStorage?.setItem(TAB_STORAGE_KEY, next);
      if (next !== 'start') {
        globalThis.localStorage?.setItem(ONBOARDING_STORAGE_KEY, '1');
      }
    } catch {
      // ignore
    }
  }

  function startBusy(key: string) {
    setBusyKey(key);
    setBusy(true);
  }

  function endBusy() {
    setBusy(false);
    setBusyKey(null);
  }

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
    startBusy('check-path');
    try {
      const result = await validateViaTauri(nextPath || null);
      setStatus(result);
      await refreshBackups(nextPath, result);
    } catch {
      const fallback: PathStatus = nextPath ? { kind: 'missing', path: nextPath } : { kind: 'not_selected', path: null };
      setStatus(fallback);
      setBackups([]);
    } finally {
      endBusy();
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

    startBusy('save-profile');
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
          iconId: profileIconId,
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
        setProfileIconId(DEFAULT_PROFILE_ICON_ID);
      } else if (isRecoverableProfileIndexError(saved)) {
        setProfileStoreError(saved);
      }
    } finally {
      endBusy();
    }
  }

  function beginEditProfile(profile: SettingsProfile) {
    const descriptor = describeProfile(profile);
    setEditingProfileId(profile.id);
    setEditName(profile.name);
    setEditKind(descriptor.kind);
    setEditAccountName(descriptor.accountName ?? '');
    setEditTags(descriptor.freeformTags.join(', '));
    setEditIconId(normalizeProfileIconId(profile.iconId));
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
    startBusy('save-edits');
    try {
      const result = await renameSavedProfile(
        profileAdapter,
        selectedProfile.id,
        {
          name: editName,
          structuralTag,
          freeformTags: splitTags(editTags),
          iconId: editIconId,
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
      endBusy();
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

    startBusy('delete-profile');
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
      endBusy();
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

    startBusy('confirm-apply');
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
      endBusy();
    }
  }

  async function confirmRestoreBackup() {
    if (!pendingRestore || !path) {
      return;
    }

    startBusy('confirm-restore');
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
      endBusy();
    }
  }

  async function recoverProfileStore() {
    startBusy('recover-profiles');
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
      endBusy();
    }
  }

  async function recoverActivityStore() {
    startBusy('recover-activity');
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
      endBusy();
    }
  }

  async function handleKeepInTrayChange(enabled: boolean) {
    setKeepInTray(enabled);
    saveKeepInTray(enabled);
    try {
      await invoke('set_idle_mode', { enabled });
    } catch {
      // Vite-only dev runs without Tauri invoke.
    }
  }

  function handleSelectProfile(profileId: string) {
    setSelectedProfileId(profileId);
    setEditingProfileId('');
    setDeleteText('');
  }

  function focusSaveNameInput() {
    changeTab('desk');
    globalThis.setTimeout(() => {
      saveNameInputRef.current?.focus();
      saveNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  async function runUpdateCheck(ignoreSkipped: boolean) {
    setUpdateChecking(true);
    try {
      const result = await checkAppUpdate({ ignoreSkipped });
      if (result.status === 'available') {
        setAvailableUpdate(result);
        return result;
      }
      setAvailableUpdate(null);
      return result;
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleCheckUpdates() {
    const result = await runUpdateCheck(true);
    if (result.status === 'available') {
      return;
    }
    if (result.status === 'current') {
      setActionMessage({
        title: interpolate(messages.update.current, { version: result.latest }),
        action: messages.update.check,
        tone: 'success',
      });
      return;
    }
    setActionMessage({
      title: messages.update.error,
      action: messages.news.openRepo,
      tone: 'warning',
    });
  }

  async function handleInstallUpdate() {
    if (!availableUpdate) {
      return;
    }
    setUpdateInstalling(true);
    setActionMessage({
      title: messages.update.installing,
      action: interpolate(messages.update.available, { version: availableUpdate.latest }),
      tone: 'warning',
    });
    try {
      const outcome = await startUpdateInstall(availableUpdate);
      if (outcome === 'opened') {
        setActionMessage({
          title: messages.update.installFailed,
          action: availableUpdate.name,
          tone: 'warning',
        });
      }
    } finally {
      setUpdateInstalling(false);
    }
  }

  function handleSkipUpdate() {
    if (!availableUpdate) {
      return;
    }
    skipUpdate(availableUpdate.latest);
    setAvailableUpdate(null);
  }

  useEffect(() => {
    async function initialize() {
      const idleEnabled = loadKeepInTray();
      setKeepInTray(idleEnabled);
      try {
        await invoke('set_idle_mode', { enabled: idleEnabled });
      } catch {
        // Vite-only dev runs without Tauri invoke.
      }

      await refreshProfiles();
      await refreshActivity();
      const stored = await loadSelectedPath(store);
      const detected = stored ?? (await detectViaTauri().catch(() => null));
      if (detected) {
        setPath(detected);
        await checkPath(detected);
      }

      await runUpdateCheck(false);
    }

    void initialize();
  }, [store]);

  const pathStrip = (
    <section className="path-strip">
      <label className="path-field">
        <span>{messages.path.selected}</span>
        <input
          value={path}
          disabled={busy}
          placeholder={messages.path.placeholder}
          onChange={(event) => setPath(event.target.value)}
          onBlur={() => saveSelectedPath(store, path)}
        />
      </label>

      <div className="path-actions">
        <button type="button" className="stamp-button stamp-button-outline" onClick={chooseFile} disabled={busy}>
          {labelBusy('choose-file', messages.path.select)}
        </button>
        <button type="button" className="stamp-button stamp-button-outline" onClick={() => checkPath()} disabled={busy}>
          {labelBusy('check-path', messages.path.recheck)}
        </button>
      </div>

      <p className="path-hint">{messages.path.hint}</p>
    </section>
  );

  return (
    <main className="shell">
      <AppHeader
        status={status}
        keepInTray={keepInTray}
        onKeepInTrayChange={handleKeepInTrayChange}
        disabled={busy}
        updateAvailable={Boolean(availableUpdate)}
        updateChecking={updateChecking}
        onCheckUpdates={() => void handleCheckUpdates()}
      />

      <TabBar current={tab} onChange={changeTab} />

      {availableUpdate ? (
        <UpdateBanner
          update={availableUpdate}
          installing={updateInstalling}
          onInstall={() => void handleInstallUpdate()}
          onLater={() => setAvailableUpdate(null)}
          onSkip={handleSkipUpdate}
        />
      ) : null}

      {profileDataNeedsRecovery ? (
        <section className="recovery-panel recovery-panel-priority">
          <div>
            <h2>{messages.recovery.profilesNeed}</h2>
            <p>{messages.recovery.profilesNeedBody}</p>
          </div>
          <button type="button" className="stamp-button stamp-button-gold" onClick={recoverProfileStore} disabled={busy}>
            {labelBusy('recover-profiles', messages.recovery.recoverProfiles)}
          </button>
        </section>
      ) : profileRecoveryResult ? (
        <section className="recovery-panel">
          <div>
            <h2>{messages.recovery.profilesRecovered}</h2>
            <p>
              {profileRecoveryResult.preservedPath
                ? messages.recovery.profilesPreserved
                : messages.recovery.profilesFresh}
            </p>
            {profileRecoveryResult.preservedPath ? (
              <small className="truncate-path" title={profileRecoveryResult.preservedPath}>
                {profileRecoveryResult.preservedPath}
              </small>
            ) : null}
          </div>
          <button type="button" className="stamp-button stamp-button-outline" onClick={() => setProfileRecoveryResult(null)}>
            {messages.common.ok}
          </button>
        </section>
      ) : null}

      <div className="tab-stage">
        {tab === 'start' ? <OnboardingTab onOpenDesk={() => changeTab('desk')} /> : null}

        {tab === 'desk' ? (
          <div className="desk-page">
            {pathStrip}
            <div className="desk-grid">
              <ProfileRoster
                groupedProfiles={groupedProfiles}
                profileCount={profiles.length}
                selectedProfileId={selectedProfileId}
                onSelectProfile={handleSelectProfile}
                onFocusSaveName={focusSaveNameInput}
              />
              <div className="desk-main">
                <ProfileDossier
                  selectedProfile={selectedProfile}
                  selectedDescriptor={selectedDescriptor}
                  status={status}
                  path={path}
                  busy={busy}
                  profileDataNeedsRecovery={profileDataNeedsRecovery}
                  pendingApplyProfile={pendingApplyProfile}
                  showApplyModal={Boolean(pendingApplyProfile)}
                  editingSelectedProfile={editingSelectedProfile}
                  editName={editName}
                  editKind={editKind}
                  editAccountName={editAccountName}
                  editTags={editTags}
                  editIconId={editIconId}
                  deleteText={deleteText}
                  onApplyClick={() => selectedProfile && setPendingApplyId(selectedProfile.id)}
                  onConfirmApply={confirmApplyProfile}
                  onCancelApply={() => setPendingApplyId('')}
                  onBeginEdit={beginEditProfile}
                  onEditNameChange={setEditName}
                  onEditKindChange={setEditKind}
                  onEditAccountNameChange={setEditAccountName}
                  onEditTagsChange={setEditTags}
                  onEditIconIdChange={setEditIconId}
                  onDeleteTextChange={setDeleteText}
                  onSaveEdits={saveProfileEdits}
                  onCancelEdit={() => setEditingProfileId('')}
                  onConfirmDelete={confirmDeleteProfile}
                  busyLabel={labelBusy}
                />
                <SavePanel
                  status={status}
                  busy={busy}
                  profileDataNeedsRecovery={profileDataNeedsRecovery}
                  profileName={profileName}
                  profileKind={profileKind}
                  accountName={accountName}
                  tagText={tagText}
                  profileIconId={profileIconId}
                  saveNameInputRef={saveNameInputRef}
                  onProfileNameChange={setProfileName}
                  onProfileKindChange={setProfileKind}
                  onAccountNameChange={setAccountName}
                  onTagTextChange={setTagText}
                  onProfileIconIdChange={setProfileIconId}
                  onSaveCurrentProfile={saveCurrentProfile}
                  busyLabel={labelBusy}
                />
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div className="history-page">
            {pathStrip}
            <JobSidebar
              path={path}
              busy={busy}
              backups={backups}
              pendingRestore={pendingRestore}
              onSelectRestore={setPendingRestorePath}
              onConfirmRestore={confirmRestoreBackup}
              onCancelRestore={() => setPendingRestorePath('')}
              activityRows={activityRows}
              activityStorageWarning={activityStorageWarning}
              activityDataNeedsRecovery={activityDataNeedsRecovery}
              activityRecoveryResult={activityRecoveryResult}
              onRecoverActivity={recoverActivityStore}
              onDismissActivityRecovery={() => setActivityRecoveryResult(null)}
              busyLabel={labelBusy}
            />
          </div>
        ) : null}

        {tab === 'news' ? (
          <ChangelogTab
            update={availableUpdate}
            checking={updateChecking}
            installing={updateInstalling}
            onCheck={() => void handleCheckUpdates()}
            onInstall={() => void handleInstallUpdate()}
          />
        ) : null}
      </div>

      <ActionToast message={actionMessage} onDismiss={() => setActionMessage(null)} />
    </main>
  );
}
