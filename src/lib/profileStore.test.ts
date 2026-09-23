import { describe, expect, it } from 'vitest';
import {
  MemoryProfileIndexAdapter,
  createProfile,
  deleteProfile,
  describeProfile,
  groupProfiles,
  isRecoverableProfileIndexError,
  loadProfiles,
  renameProfile,
  renameSavedProfile,
  saveProfile,
  type CreateProfileInput,
  type SettingsProfile,
} from './profileStore';
import type { Clock } from './types';

const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
};

function makeProfile(input: Partial<CreateProfileInput> = {}) {
  return createProfile(
    {
      name: 'Main profile',
      tags: ['shared'],
      settingsJson: '{"hudScale":1}',
      ...input,
    },
    { clock, idFactory: () => 'profile-1' },
  );
}

describe('createProfile', () => {
  it('creates a shared profile with minimal metadata', () => {
    const result = makeProfile({ tags: [' shared ', ' ranked ', 'ranked'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: 'profile-1',
        name: 'Main profile',
        tags: ['shared', 'ranked'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        settingsJson: '{"hudScale":1}',
        iconId: 'horned-gear',
      });
    }
  });

  it('creates an account-tagged profile', () => {
    const result = makeProfile({ tags: ['account:bot lane', 'camera'] });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.tags : []).toEqual(['account:bot lane', 'camera']);
  });

  it('defaults to the horned-gear badge', () => {
    const result = makeProfile();

    expect(result.ok ? result.value.iconId : null).toBe('horned-gear');
  });

  it('stores a chosen badge icon', () => {
    const result = makeProfile({ iconId: 'crossed-blades' });

    expect(result.ok ? result.value.iconId : null).toBe('crossed-blades');
  });

  it('rejects empty names', () => {
    const result = makeProfile({ name: '   ' });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_profile_name');
  });

  it('rejects invalid profile JSON', () => {
    const result = makeProfile({ settingsJson: '{bad' });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_profile_json');
  });

  it('rejects profiles without a structural tag', () => {
    const result = makeProfile({ tags: ['ranked'] });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('missing_structural_tag');
  });

  it('rejects empty account tags', () => {
    const result = makeProfile({ tags: ['account:   '] });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_account_tag');
  });

  it('rejects multiple structural tags', () => {
    const result = makeProfile({ tags: ['shared', 'account:main'] });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_structural_tags');
  });
});

describe('profile organization', () => {
  it('groups profiles into fixed shared and account sections', () => {
    const shared = makeProfile({ name: 'Shared B', tags: ['shared', 'ranked'] });
    const account = makeProfile({ name: 'Account A', tags: ['account:Gabriel', 'camera'] });

    expect(shared.ok).toBe(true);
    expect(account.ok).toBe(true);
    if (!shared.ok || !account.ok) {
      return;
    }

    const grouped = groupProfiles([
      { ...shared.value, id: 'shared-1' },
      { ...account.value, id: 'account-1' },
    ]);

    expect(grouped.shared.map((profile) => profile.name)).toEqual(['Shared B']);
    expect(grouped.accounts).toHaveLength(1);
    expect(grouped.accounts[0]).toMatchObject({
      accountName: 'Gabriel',
      structuralTag: 'account:Gabriel',
    });
    expect(describeProfile(account.value).freeformTags).toEqual(['camera']);
  });
});

describe('profile updates', () => {
  it('renames a profile without changing its id, createdAt, or settings JSON', () => {
    const profile = makeProfile();

    expect(profile.ok).toBe(true);
    if (!profile.ok) {
      return;
    }

    const result = renameProfile(
      profile.value,
      {
        name: 'Updated name',
        structuralTag: 'account:Main',
        freeformTags: ['ranked', 'camera'],
      },
      { clock: { now: () => new Date(Date.UTC(2026, 0, 2, 0, 0, 0)) } },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        id: profile.value.id,
        name: 'Updated name',
        createdAt: profile.value.createdAt,
        updatedAt: '2026-01-02T00:00:00.000Z',
        settingsJson: profile.value.settingsJson,
        tags: ['account:Main', 'ranked', 'camera'],
        iconId: 'horned-gear',
      });
    }
  });

  it('deletes only after the typed profile name matches exactly', async () => {
    const profile = makeProfile();

    expect(profile.ok).toBe(true);
    if (!profile.ok) {
      return;
    }

    const adapter = new MemoryProfileIndexAdapter();
    await saveProfile(adapter, profile.value);

    const mismatch = await deleteProfile(adapter, profile.value.id, 'main profile');
    expect(mismatch.ok).toBe(false);
    expect(mismatch.ok ? '' : mismatch.code).toBe('delete_confirmation_mismatch');

    const deleted = await deleteProfile(adapter, profile.value.id, 'Main profile');
    expect(deleted.ok).toBe(true);
    expect(deleted.ok ? deleted.value.profiles : []).toEqual([]);
  });
});

describe('profile index persistence', () => {
  it('loads missing profile index as empty', async () => {
    const result = await loadProfiles(new MemoryProfileIndexAdapter());

    expect(result).toEqual({ ok: true, value: { profiles: [] } });
  });

  it('saves and reloads profiles without losing fields', async () => {
    const adapter = new MemoryProfileIndexAdapter();
    const profile = makeProfile();

    expect(profile.ok).toBe(true);
    const saved = await saveProfile(adapter, (profile as { ok: true; value: SettingsProfile }).value);
    const loaded = await loadProfiles(adapter);

    expect(saved.ok).toBe(true);
    expect(loaded.ok ? loaded.value.profiles : []).toEqual(saved.ok ? saved.value.profiles : []);
  });

  it('reports malformed profile index JSON without overwriting it', async () => {
    const adapter = new MemoryProfileIndexAdapter('{bad');
    const profile = makeProfile();

    expect(profile.ok).toBe(true);
    const result = await saveProfile(adapter, (profile as { ok: true; value: SettingsProfile }).value);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_index_json');
    expect(isRecoverableProfileIndexError(result)).toBe(true);
    expect(await adapter.loadIndex()).toBe('{bad');
  });

  it('treats unsupported profile index shape as recoverable', async () => {
    const result = await loadProfiles(new MemoryProfileIndexAdapter('{"profiles":{}}'));

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_index_shape');
    expect(isRecoverableProfileIndexError(result)).toBe(true);
    expect(isRecoverableProfileIndexError('invalid_profile_json')).toBe(false);
  });

  it('does not overwrite corrupted profile indexes on rename or delete', async () => {
    const malformedJsonAdapter = new MemoryProfileIndexAdapter('{bad');
    const malformedShapeAdapter = new MemoryProfileIndexAdapter('{"profiles":{}}');

    const renamed = await renameSavedProfile(
      malformedJsonAdapter,
      'profile-1',
      { name: 'Updated', structuralTag: 'shared', freeformTags: [] },
      { clock },
    );
    const deleted = await deleteProfile(malformedShapeAdapter, 'profile-1', 'Main profile');

    expect(renamed.ok).toBe(false);
    expect(renamed.ok ? '' : renamed.code).toBe('invalid_index_json');
    expect(deleted.ok).toBe(false);
    expect(deleted.ok ? '' : deleted.code).toBe('invalid_index_shape');
    expect(await malformedJsonAdapter.loadIndex()).toBe('{bad');
    expect(await malformedShapeAdapter.loadIndex()).toBe('{"profiles":{}}');
  });
});
