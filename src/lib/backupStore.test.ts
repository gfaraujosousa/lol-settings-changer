import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createTempWorkspace, backupRoot, NodeFileSystemAdapter, writeSettingsFile } from '../test/fixtures';
import { BackupStore } from './backupStore';
import type { Clock } from './types';

let workspace: Awaited<ReturnType<typeof createTempWorkspace>>;

function clockAt(index: number): Clock {
  return {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
  };
}

beforeEach(async () => {
  workspace = await createTempWorkspace();
});

afterEach(async () => {
  await workspace.cleanup();
});

describe('BackupStore', () => {
  it('creates timestamped backups and keeps the latest 10', async () => {
    const fs = new NodeFileSystemAdapter();
    const settings = await writeSettingsFile(workspace.root);

    for (let i = 0; i < 11; i += 1) {
      const store = new BackupStore(fs, clockAt(i), { backupRoot: backupRoot(workspace.root) });
      await store.createBackup(settings);
    }

    const backupDirs = await fs.listFiles(backupRoot(workspace.root));
    const backupFiles = await fs.listFiles(backupDirs[0]);

    expect(backupFiles).toHaveLength(10);
    expect(backupFiles.some((file) => file.includes('00-00-00'))).toBe(false);
  });

  it('lists backups newest first and ignores non-json files', async () => {
    const fs = new NodeFileSystemAdapter();
    const settings = await writeSettingsFile(workspace.root);

    for (let i = 0; i < 3; i += 1) {
      const store = new BackupStore(fs, clockAt(i), { backupRoot: backupRoot(workspace.root) });
      await store.createBackup(settings);
    }

    const backupDirs = await fs.listFiles(backupRoot(workspace.root));
    await fs.writeText(join(backupDirs[0], 'ignore.txt'), 'not a backup');

    const store = new BackupStore(fs, clockAt(4), { backupRoot: backupRoot(workspace.root) });
    const backups = await store.listBackups(settings);

    expect(backups).toHaveLength(3);
    expect(backups.map((backup) => backup.createdAt)).toEqual([
      '2026-01-01T00:00:02.000Z',
      '2026-01-01T00:00:01.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
    expect(backups.every((backup) => backup.path.endsWith('.json'))).toBe(true);
  });
});
