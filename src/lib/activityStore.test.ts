import { describe, expect, it } from 'vitest';
import {
  MemoryActivityIndexAdapter,
  appendActivityEntry,
  loadActivity,
  parseActivityIndex,
  type ActivityEntry,
} from './activityStore';

function activityEntry(id: string, occurredAt = `2026-01-01T00:00:${id.padStart(2, '0')}.000Z`): ActivityEntry {
  return {
    id,
    action: 'save_profile',
    status: 'success',
    occurredAt,
    title: 'Profile saved',
    message: 'Main profile was saved.',
    friendlyCode: 'save_profile_succeeded',
    profileId: 'profile-1',
    profileName: 'Main profile',
  };
}

describe('activity index persistence', () => {
  it('loads missing activity storage as empty', async () => {
    const result = await loadActivity(new MemoryActivityIndexAdapter());

    expect(result).toEqual({ ok: true, value: { entries: [] } });
  });

  it('appends newest activity entries first', async () => {
    const adapter = new MemoryActivityIndexAdapter();

    await appendActivityEntry(adapter, activityEntry('1'));
    const result = await appendActivityEntry(adapter, {
      ...activityEntry('2'),
      action: 'apply_profile',
      friendlyCode: 'apply_profile_succeeded',
      targetPath: 'C:/Riot Games/League of Legends/Config/PersistedSettings.json',
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.entries.map((entry) => entry.id) : []).toEqual(['2', '1']);
  });

  it('keeps only the newest 100 entries', async () => {
    const adapter = new MemoryActivityIndexAdapter();

    for (let index = 1; index <= 101; index += 1) {
      const id = index.toString();
      const result = await appendActivityEntry(adapter, activityEntry(id));
      expect(result.ok).toBe(true);
    }

    const result = await loadActivity(adapter);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.entries : []).toHaveLength(100);
    expect(result.ok ? result.value.entries[0].id : '').toBe('101');
    expect(result.ok ? result.value.entries.at(-1)?.id : '').toBe('2');
  });

  it('reports malformed activity JSON without overwriting it', async () => {
    const adapter = new MemoryActivityIndexAdapter('{bad');
    const result = await appendActivityEntry(adapter, activityEntry('1'));

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_activity_json');
    expect(result.ok ? false : result.recoverable).toBe(true);
    expect(await adapter.loadIndex()).toBe('{bad');
  });

  it('rejects unsupported activity index shapes', () => {
    const result = parseActivityIndex(JSON.stringify({ entries: [{ ...activityEntry('1'), status: 'pending' }] }));

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_activity_shape');
  });

  it('rejects unsupported activity actions', () => {
    const result = parseActivityIndex(
      JSON.stringify({
        entries: [{ ...activityEntry('1'), action: 'rename_profile' }],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_activity_shape');
  });

  it('accepts failure entries with friendly codes and sparse recovery paths', () => {
    const result = parseActivityIndex(
      JSON.stringify({
        entries: [
          {
            id: 'failure-1',
            action: 'restore_backup',
            status: 'failure',
            occurredAt: '2026-01-01T00:00:00.000Z',
            title: 'Restore failed',
            message: 'Backup file is invalid.',
            friendlyCode: 'restore_backup_failed',
            backupPath: 'C:/Users/Player/AppData/Local/lol-settings-changer/backups/settings/backup.json',
            targetPath: 'C:/Riot Games/League of Legends/Config/PersistedSettings.json',
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });
});
