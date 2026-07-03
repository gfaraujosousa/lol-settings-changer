import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupRoot,
  createTempWorkspace,
  FailingRenameAdapter,
  FailingRollbackAdapter,
  NodeFileSystemAdapter,
  writeSettingsFile,
  writeWrongFile,
} from '../test/fixtures';
import { safeWriteSettingsFile } from './settingsFile';
import type { Clock } from './types';

let workspace: Awaited<ReturnType<typeof createTempWorkspace>>;

const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
};

beforeEach(async () => {
  workspace = await createTempWorkspace();
});

afterEach(async () => {
  await workspace.cleanup();
});

describe('safeWriteSettingsFile', () => {
  it('rejects the wrong filename before writing', async () => {
    const file = await writeWrongFile(workspace.root);
    const result = await safeWriteSettingsFile(new NodeFileSystemAdapter(), file, '{}', {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('wrong_file');
  });

  it('rejects invalid incoming JSON before backup/write', async () => {
    const file = await writeSettingsFile(workspace.root);
    const result = await safeWriteSettingsFile(new NodeFileSystemAdapter(), file, '{bad', {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('invalid_next_json');
  });

  it('creates a backup and writes valid settings', async () => {
    const fs = new NodeFileSystemAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await safeWriteSettingsFile(fs, file, '{"hudScale":2}', {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(await fs.exists(result.backup.path)).toBe(true);
    }
    expect(await fs.readText(file)).toBe('{"hudScale":2}');
  });

  it('rolls back automatically when replacement fails after backup', async () => {
    const fs = new FailingRenameAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await safeWriteSettingsFile(fs, file, '{"hudScale":2}', {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('write_failed_rollback_succeeded');
    expect(await fs.readText(file)).toBe('{"hudScale":1}');
  });

  it('preserves backup path when rollback fails', async () => {
    const fs = new FailingRollbackAdapter();
    const file = await writeSettingsFile(workspace.root, '{"hudScale":1}');
    const result = await safeWriteSettingsFile(fs, file, '{"hudScale":2}', {
      backupRoot: backupRoot(workspace.root),
      clock,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('write_failed_rollback_failed');
    expect(result.ok ? undefined : result.backupPath).toBeTruthy();
  });
});
