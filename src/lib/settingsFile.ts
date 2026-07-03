import type { Clock, FileSystemAdapter } from './types';
import { BackupStore, type BackupRecord } from './backupStore';
import { SETTINGS_FILE_NAME, baseName, parentDir } from './pathUtils';

export type SafeWriteResult =
  | { ok: true; backup: BackupRecord }
  | { ok: false; code: SafeWriteErrorCode; message: string; backupPath?: string; cause?: unknown };

export type SafeWriteErrorCode =
  | 'wrong_file'
  | 'missing'
  | 'invalid_current_json'
  | 'invalid_next_json'
  | 'backup_failed'
  | 'write_failed_rollback_succeeded'
  | 'write_failed_rollback_failed'
  | 'post_write_verification_failed';

export interface SafeWriteOptions {
  backupRoot: string;
  clock: Clock;
  tempSuffix?: string;
}

export async function parseSettingsJson(contents: string): Promise<unknown> {
  return JSON.parse(contents);
}

export async function safeWriteSettingsFile(
  fs: FileSystemAdapter,
  targetPath: string,
  nextContents: string,
  options: SafeWriteOptions,
): Promise<SafeWriteResult> {
  if (baseName(targetPath) !== SETTINGS_FILE_NAME) {
    return { ok: false, code: 'wrong_file', message: 'Choose PersistedSettings.json.' };
  }

  if (!(await fs.exists(targetPath))) {
    return { ok: false, code: 'missing', message: 'Select the settings file.' };
  }

  try {
    await parseSettingsJson(await fs.readText(targetPath));
  } catch (cause) {
    return { ok: false, code: 'invalid_current_json', message: 'Choose a valid settings file.', cause };
  }

  try {
    await parseSettingsJson(nextContents);
  } catch (cause) {
    return { ok: false, code: 'invalid_next_json', message: 'Choose a valid settings file.', cause };
  }

  const backupStore = new BackupStore(fs, options.clock, { backupRoot: options.backupRoot });
  let backup: BackupRecord;
  try {
    backup = await backupStore.createBackup(targetPath);
  } catch (cause) {
    return { ok: false, code: 'backup_failed', message: 'Could not create a backup.', cause };
  }

  const tempPath = `${parentDir(targetPath)}/${SETTINGS_FILE_NAME}${options.tempSuffix ?? '.tmp'}`;
  try {
    await fs.writeText(tempPath, nextContents);
    await fs.rename(tempPath, targetPath);
    await parseSettingsJson(await fs.readText(targetPath));
    return { ok: true, backup };
  } catch (cause) {
    try {
      await backupStore.restoreBackup(backup.path, targetPath);
      return {
        ok: false,
        code: 'write_failed_rollback_succeeded',
        message: 'The write failed. Your previous settings were restored.',
        backupPath: backup.path,
        cause,
      };
    } catch (rollbackCause) {
      return {
        ok: false,
        code: 'write_failed_rollback_failed',
        message: 'The write failed. Restore the backup manually.',
        backupPath: backup.path,
        cause: rollbackCause,
      };
    }
  }
}

export async function roundTripSettingsFile(
  fs: FileSystemAdapter,
  targetPath: string,
  options: SafeWriteOptions,
): Promise<SafeWriteResult> {
  const current = await fs.readText(targetPath);
  return safeWriteSettingsFile(fs, targetPath, current, options);
}
