import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  FailingRenameAdapter,
  NodeFileSystemAdapter,
  backupRoot,
  createTempWorkspace,
  writeSettingsFile,
} from '../test/fixtures';
import { BackupStore } from './backupStore';
import { applyProfileToSettings, restoreBackupToSettings } from './profileActions';
import type { SettingsProfile } from './profileStore';
import type { Clock } from './types';

let workspace: Awaited<ReturnType<typeof createTempWorkspace>>;

const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
};

function clockAt(second: number): Clock {
  return {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, second)),
  };
}

function profile(settingsJson = '{"hudScale":2}'): SettingsProfile {
  return {
    id: 'profile-1',
    name: 'Main',
    tags: ['shared'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    settingsJson,
  };
}

beforeEach(async () => {
  workspace = await createTempWorkspace();
});

afterEach(async () => {
  await workspace.cleanup();
});

describe('applyProfileToSettings', () => {
  it('rejects invalid profile JSON before creating a backup', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await applyProfileToSettings(fs, profile('{bad'), file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_profile_json');
    expect(await fs.exists(backupRoot(workspace.root))).toBe(false);
    expect(await fs.readText(file)).toBe('{"hudScale":1}');
  });

  it('writes valid profile settings through the safe write layer', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await applyProfileToSettings(fs, profile('{"hudScale":2}'), file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(true);
    expect(await fs.readText(file)).toBe('{"hudScale":2}');
    if (result.ok) {
      expect(await fs.exists(result.backup.path)).toBe(true);
    }
  });

  it('uses rollback behavior when profile replacement fails', async () => {
    const fs = new FailingRenameAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await applyProfileToSettings(fs, profile('{"hudScale":2}'), file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('write_failed_rollback_succeeded');
    expect(await fs.readText(file)).toBe('{"hudScale":1}');
  });
});

describe('restoreBackupToSettings', () => {
  it('restores a valid backup after backing up current settings', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const store = new BackupStore(fs, clock, { backupRoot: backupRoot(workspace.root) });
    const original = await store.createBackup(file);
    await fs.writeText(file, '{"hudScale":3}');

    const result = await restoreBackupToSettings(fs, original.path, file, {
      backupRoot: backupRoot(workspace.root),
      clock: clockAt(1),
    });

    expect(result.ok).toBe(true);
    expect(await fs.readText(file)).toBe('{"hudScale":1}');
    expect(await store.listBackups(file)).toHaveLength(2);
  });

  it('blocks missing backups and leaves current settings untouched', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":3}');
    const result = await restoreBackupToSettings(fs, join(workspace.root, 'missing.json'), file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('missing_backup');
    expect(await fs.readText(file)).toBe('{"hudScale":3}');
  });

  it('blocks invalid backup JSON and leaves current settings untouched', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":3}');
    const backupPath = join(workspace.root, 'invalid-backup.json');
    await fs.writeText(backupPath, '{bad');

    const result = await restoreBackupToSettings(fs, backupPath, file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_backup_json');
    expect(await fs.readText(file)).toBe('{"hudScale":3}');
  });

  it('uses rollback behavior when restore replacement fails', async () => {
    const fs = new FailingRenameAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":3}');
    const backupPath = join(workspace.root, 'backup.json');
    await fs.writeText(backupPath, '{"hudScale":1}');

    const result = await restoreBackupToSettings(fs, backupPath, file, {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('write_failed_rollback_succeeded');
    expect(await fs.readText(file)).toBe('{"hudScale":3}');
  });
});
