import type { BackupRecord } from './backupStore';
import type { SafeWriteErrorCode } from './settingsFile';
import { parseSettingsJson, safeWriteSettingsFile } from './settingsFile';
import type { SettingsProfile } from './profileStore';
import type { Clock, FileSystemAdapter } from './types';

export type ProfileActionResult =
  | { ok: true; backup: BackupRecord }
  | {
      ok: false;
      code: ProfileActionErrorCode;
      message: string;
      backupPath?: string;
      cause?: unknown;
    };

export type ProfileActionErrorCode =
  | 'invalid_profile_json'
  | 'missing_backup'
  | 'invalid_backup_json'
  | SafeWriteErrorCode;

export interface ProfileWriteOptions {
  backupRoot: string;
  clock: Clock;
}

export async function applyProfileToSettings(
  fs: FileSystemAdapter,
  profile: SettingsProfile,
  targetPath: string,
  options: ProfileWriteOptions,
): Promise<ProfileActionResult> {
  try {
    await parseSettingsJson(profile.settingsJson);
  } catch (cause) {
    return {
      ok: false,
      code: 'invalid_profile_json',
      message: 'Profile settings are invalid.',
      cause,
    };
  }

  return safeWriteSettingsFile(fs, targetPath, profile.settingsJson, options);
}

export async function restoreBackupToSettings(
  fs: FileSystemAdapter,
  backupPath: string,
  targetPath: string,
  options: ProfileWriteOptions,
): Promise<ProfileActionResult> {
  if (!(await fs.exists(backupPath))) {
    return { ok: false, code: 'missing_backup', message: 'Backup file not found.' };
  }

  let backupContents: string;
  try {
    backupContents = await fs.readText(backupPath);
    await parseSettingsJson(backupContents);
  } catch (cause) {
    return {
      ok: false,
      code: 'invalid_backup_json',
      message: 'Backup file is invalid.',
      cause,
    };
  }

  return safeWriteSettingsFile(fs, targetPath, backupContents, options);
}
