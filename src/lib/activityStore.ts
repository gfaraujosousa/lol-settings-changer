export type ActivityAction = 'save_profile' | 'apply_profile' | 'restore_backup';

export type ActivityStatus = 'success' | 'failure';

export type ActivityFriendlyCode =
  | 'save_profile_succeeded'
  | 'save_profile_failed'
  | 'apply_profile_succeeded'
  | 'apply_profile_failed'
  | 'restore_backup_succeeded'
  | 'restore_backup_failed';

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  status: ActivityStatus;
  occurredAt: string;
  title: string;
  message: string;
  friendlyCode?: ActivityFriendlyCode;
  profileId?: string;
  profileName?: string;
  backupPath?: string;
  targetPath?: string;
}

export interface ActivityIndex {
  entries: ActivityEntry[];
}

export interface ActivityIndexAdapter {
  loadIndex(): Promise<string | null>;
  saveIndex(contents: string): Promise<void>;
}

export type ActivityStoreErrorCode =
  | 'invalid_activity_json'
  | 'invalid_activity_shape'
  | 'save_failed';

export type ActivityStoreResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: ActivityStoreErrorCode;
      message: string;
      recoverable: boolean;
      cause?: unknown;
    };

const ACTIVITY_ACTIONS = ['save_profile', 'apply_profile', 'restore_backup'] as const;
const ACTIVITY_STATUSES = ['success', 'failure'] as const;
const ACTIVITY_FRIENDLY_CODES = [
  'save_profile_succeeded',
  'save_profile_failed',
  'apply_profile_succeeded',
  'apply_profile_failed',
  'restore_backup_succeeded',
  'restore_backup_failed',
] as const;

const DEFAULT_RETENTION_COUNT = 100;

export const emptyActivityIndex = (): ActivityIndex => ({ entries: [] });

function isActivityAction(value: unknown): value is ActivityAction {
  return typeof value === 'string' && (ACTIVITY_ACTIONS as readonly string[]).includes(value);
}

function isActivityStatus(value: unknown): value is ActivityStatus {
  return typeof value === 'string' && (ACTIVITY_STATUSES as readonly string[]).includes(value);
}

function isActivityFriendlyCode(value: unknown): value is ActivityFriendlyCode {
  return typeof value === 'string' && (ACTIVITY_FRIENDLY_CODES as readonly string[]).includes(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<ActivityEntry>;
  return (
    typeof entry.id === 'string' &&
    isActivityAction(entry.action) &&
    isActivityStatus(entry.status) &&
    typeof entry.occurredAt === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.message === 'string' &&
    (entry.friendlyCode === undefined || isActivityFriendlyCode(entry.friendlyCode)) &&
    isOptionalString(entry.profileId) &&
    isOptionalString(entry.profileName) &&
    isOptionalString(entry.backupPath) &&
    isOptionalString(entry.targetPath)
  );
}

export function parseActivityIndex(contents: string | null): ActivityStoreResult<ActivityIndex> {
  if (!contents) {
    return { ok: true, value: emptyActivityIndex() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (cause) {
    return {
      ok: false,
      code: 'invalid_activity_json',
      message: 'Recent activity could not be read.',
      recoverable: true,
      cause,
    };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as ActivityIndex).entries) ||
    !(parsed as ActivityIndex).entries.every(isActivityEntry)
  ) {
    return {
      ok: false,
      code: 'invalid_activity_shape',
      message: 'Recent activity has an unsupported format.',
      recoverable: true,
    };
  }

  return { ok: true, value: parsed as ActivityIndex };
}

export async function loadActivity(adapter: ActivityIndexAdapter): Promise<ActivityStoreResult<ActivityIndex>> {
  return parseActivityIndex(await adapter.loadIndex());
}

export async function appendActivityEntry(
  adapter: ActivityIndexAdapter,
  entry: ActivityEntry,
  retentionCount = DEFAULT_RETENTION_COUNT,
): Promise<ActivityStoreResult<ActivityIndex>> {
  if (!isActivityEntry(entry)) {
    return {
      ok: false,
      code: 'invalid_activity_shape',
      message: 'Recent activity entry has an unsupported format.',
      recoverable: false,
    };
  }

  const current = await loadActivity(adapter);
  if (!current.ok) {
    return current;
  }

  const next = {
    entries: [entry, ...current.value.entries].slice(0, retentionCount),
  };

  try {
    await adapter.saveIndex(JSON.stringify(next, null, 2));
    return { ok: true, value: next };
  } catch (cause) {
    return {
      ok: false,
      code: 'save_failed',
      message: 'Recent activity could not be saved.',
      recoverable: false,
      cause,
    };
  }
}

export class MemoryActivityIndexAdapter implements ActivityIndexAdapter {
  constructor(private contents: string | null = null) {}

  async loadIndex(): Promise<string | null> {
    return this.contents;
  }

  async saveIndex(contents: string): Promise<void> {
    this.contents = contents;
  }
}
