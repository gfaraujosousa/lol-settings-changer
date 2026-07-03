import type { Clock } from './types';

export interface SettingsProfile {
  id: string;
  name: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  settingsJson: string;
}

export interface ProfileIndex {
  profiles: SettingsProfile[];
}

export interface ProfileIndexAdapter {
  loadIndex(): Promise<string | null>;
  saveIndex(contents: string): Promise<void>;
}

export type ProfileStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProfileStoreErrorCode; message: string; cause?: unknown };

export type ProfileStoreErrorCode =
  | 'invalid_profile_name'
  | 'invalid_profile_json'
  | 'missing_structural_tag'
  | 'invalid_structural_tags'
  | 'invalid_account_tag'
  | 'invalid_index_json'
  | 'invalid_index_shape'
  | 'profile_not_found'
  | 'delete_confirmation_mismatch'
  | 'save_failed';

export interface CreateProfileInput {
  name: string;
  tags: string[];
  settingsJson: string;
}

export type ProfileKind = 'shared' | 'account';

export interface ProfileDescriptor {
  structuralTag: string;
  kind: ProfileKind;
  accountName: string | null;
  freeformTags: string[];
}

export interface ProfileAccountGroup {
  accountName: string;
  structuralTag: string;
  profiles: SettingsProfile[];
}

export interface GroupedProfiles {
  shared: SettingsProfile[];
  accounts: ProfileAccountGroup[];
}

export interface CreateProfileOptions {
  clock: Clock;
  idFactory: () => string;
}

export interface RenameProfileInput {
  name: string;
  structuralTag: string;
  freeformTags: string[];
}

export interface RenameProfileOptions {
  clock: Clock;
}

export const emptyProfileIndex = (): ProfileIndex => ({ profiles: [] });

export function isRecoverableProfileIndexError(
  resultOrCode: ProfileStoreErrorCode | ProfileStoreResult<unknown>,
): boolean {
  const code = typeof resultOrCode === 'string' ? resultOrCode : resultOrCode.ok ? null : resultOrCode.code;
  return code === 'invalid_index_json' || code === 'invalid_index_shape';
}

export function normalizeProfileTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const next = tag.trim().replace(/\s+/g, ' ');
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

export function structuralTags(tags: string[]): string[] {
  return tags.filter((tag) => tag === 'shared' || tag.startsWith('account:'));
}

export function profileFreeformTags(profile: SettingsProfile): string[] {
  const structural = new Set(structuralTags(profile.tags));
  return profile.tags.filter((tag) => !structural.has(tag));
}

export function describeProfile(profile: SettingsProfile): ProfileDescriptor {
  const structuralTag = structuralTags(profile.tags)[0] ?? 'shared';

  if (structuralTag.startsWith('account:')) {
    return {
      structuralTag,
      kind: 'account',
      accountName: structuralTag.slice('account:'.length).trim(),
      freeformTags: profileFreeformTags(profile),
    };
  }

  return {
    structuralTag: 'shared',
    kind: 'shared',
    accountName: null,
    freeformTags: profileFreeformTags(profile),
  };
}

function sortProfilesByName(profiles: SettingsProfile[]): SettingsProfile[] {
  return [...profiles].sort((left, right) => left.name.localeCompare(right.name));
}

export function groupProfiles(profiles: SettingsProfile[]): GroupedProfiles {
  const shared: SettingsProfile[] = [];
  const accounts = new Map<string, ProfileAccountGroup>();

  for (const profile of profiles) {
    const descriptor = describeProfile(profile);
    if (descriptor.kind === 'shared') {
      shared.push(profile);
      continue;
    }

    const accountName = descriptor.accountName || 'Unnamed account';
    const existing = accounts.get(descriptor.structuralTag);
    if (existing) {
      existing.profiles.push(profile);
    } else {
      accounts.set(descriptor.structuralTag, {
        accountName,
        structuralTag: descriptor.structuralTag,
        profiles: [profile],
      });
    }
  }

  return {
    shared: sortProfilesByName(shared),
    accounts: [...accounts.values()]
      .map((group) => ({ ...group, profiles: sortProfilesByName(group.profiles) }))
      .sort((left, right) => left.accountName.localeCompare(right.accountName)),
  };
}

export function validateProfileInput(input: CreateProfileInput): ProfileStoreResult<CreateProfileInput> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, code: 'invalid_profile_name', message: 'Name the profile before saving.' };
  }

  try {
    JSON.parse(input.settingsJson);
  } catch (cause) {
    return { ok: false, code: 'invalid_profile_json', message: 'Profile settings must be valid JSON.', cause };
  }

  const tags = normalizeProfileTags(input.tags);
  const hasSharedTag = tags.includes('shared');
  const accountTags = tags.filter((tag) => tag.startsWith('account:'));
  if (!hasSharedTag && accountTags.length === 0) {
    return {
      ok: false,
      code: 'missing_structural_tag',
      message: 'Add shared or account:<name> before saving.',
    };
  }

  if (accountTags.some((tag) => tag.slice('account:'.length).trim() === '')) {
    return { ok: false, code: 'invalid_account_tag', message: 'Account profiles need an account name.' };
  }

  if ((hasSharedTag ? 1 : 0) + accountTags.length !== 1) {
    return {
      ok: false,
      code: 'invalid_structural_tags',
      message: 'Use exactly one shared or account:<name> tag.',
    };
  }

  return { ok: true, value: { name, tags, settingsJson: input.settingsJson } };
}

export function createProfile(
  input: CreateProfileInput,
  options: CreateProfileOptions,
): ProfileStoreResult<SettingsProfile> {
  const validation = validateProfileInput(input);
  if (!validation.ok) {
    return validation;
  }

  const now = options.clock.now().toISOString();
  return {
    ok: true,
    value: {
      id: options.idFactory(),
      name: validation.value.name,
      tags: validation.value.tags,
      createdAt: now,
      updatedAt: now,
      settingsJson: validation.value.settingsJson,
    },
  };
}

export function renameProfile(
  profile: SettingsProfile,
  input: RenameProfileInput,
  options: RenameProfileOptions,
): ProfileStoreResult<SettingsProfile> {
  const validation = validateProfileInput({
    name: input.name,
    tags: [input.structuralTag, ...input.freeformTags],
    settingsJson: profile.settingsJson,
  });

  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    value: {
      ...profile,
      name: validation.value.name,
      tags: validation.value.tags,
      updatedAt: options.clock.now().toISOString(),
    },
  };
}

export function parseProfileIndex(contents: string | null): ProfileStoreResult<ProfileIndex> {
  if (!contents) {
    return { ok: true, value: emptyProfileIndex() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (cause) {
    return { ok: false, code: 'invalid_index_json', message: 'Saved profiles could not be read.', cause };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as ProfileIndex).profiles)
  ) {
    return { ok: false, code: 'invalid_index_shape', message: 'Saved profiles have an unsupported format.' };
  }

  return { ok: true, value: parsed as ProfileIndex };
}

export async function loadProfiles(adapter: ProfileIndexAdapter): Promise<ProfileStoreResult<ProfileIndex>> {
  return parseProfileIndex(await adapter.loadIndex());
}

export async function saveProfile(
  adapter: ProfileIndexAdapter,
  profile: SettingsProfile,
): Promise<ProfileStoreResult<ProfileIndex>> {
  const current = await loadProfiles(adapter);
  if (!current.ok) {
    return current;
  }

  const next = {
    profiles: [...current.value.profiles.filter((item) => item.id !== profile.id), profile],
  };

  try {
    await adapter.saveIndex(JSON.stringify(next, null, 2));
    return { ok: true, value: next };
  } catch (cause) {
    return { ok: false, code: 'save_failed', message: 'Profile could not be saved.', cause };
  }
}

export async function renameSavedProfile(
  adapter: ProfileIndexAdapter,
  id: string,
  input: RenameProfileInput,
  options: RenameProfileOptions,
): Promise<ProfileStoreResult<ProfileIndex>> {
  const current = await loadProfiles(adapter);
  if (!current.ok) {
    return current;
  }

  const existing = current.value.profiles.find((profile) => profile.id === id);
  if (!existing) {
    return { ok: false, code: 'profile_not_found', message: 'Profile was not found.' };
  }

  const renamed = renameProfile(existing, input, options);
  if (!renamed.ok) {
    return renamed;
  }

  return saveProfile(adapter, renamed.value);
}

export async function deleteProfile(
  adapter: ProfileIndexAdapter,
  id: string,
  typedName: string,
): Promise<ProfileStoreResult<ProfileIndex>> {
  const current = await loadProfiles(adapter);
  if (!current.ok) {
    return current;
  }

  const existing = current.value.profiles.find((profile) => profile.id === id);
  if (!existing) {
    return { ok: false, code: 'profile_not_found', message: 'Profile was not found.' };
  }

  if (typedName !== existing.name) {
    return {
      ok: false,
      code: 'delete_confirmation_mismatch',
      message: 'Profile name did not match.',
    };
  }

  const next = {
    profiles: current.value.profiles.filter((profile) => profile.id !== id),
  };

  try {
    await adapter.saveIndex(JSON.stringify(next, null, 2));
    return { ok: true, value: next };
  } catch (cause) {
    return { ok: false, code: 'save_failed', message: 'Profile could not be deleted.', cause };
  }
}

export class MemoryProfileIndexAdapter implements ProfileIndexAdapter {
  constructor(private contents: string | null = null) {}

  async loadIndex(): Promise<string | null> {
    return this.contents;
  }

  async saveIndex(contents: string): Promise<void> {
    this.contents = contents;
  }
}
