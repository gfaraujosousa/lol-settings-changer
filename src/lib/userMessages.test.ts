import { describe, expect, it } from 'vitest';
import {
  activityDetailsForApplyResult,
  activityDetailsForRestoreResult,
  activityDetailsForSaveResult,
  messageForActivityStoreResult,
  messageForApplyResult,
  messageForLocalStoreRecoveryPrompt,
  messageForLocalStoreRecoverySuccess,
  messageForPathStatus,
  messageForProfileDeleteResult,
  messageForProfileRenameResult,
  messageForProfileStoreResult,
  messageForRestoreResult,
  messageForWriteResult,
} from './userMessages';

describe('messageForPathStatus', () => {
  it('shows a simple suggested action for missing files', () => {
    const message = messageForPathStatus({ kind: 'missing', path: 'PersistedSettings.json' });

    expect(message.title).toBe('Settings file not found.');
    expect(message.action).toContain('Select');
  });

  it('does not expose parser details for invalid JSON', () => {
    const message = messageForPathStatus({
      kind: 'invalid_json',
      path: 'PersistedSettings.json',
      detail: 'Unexpected token at line 1',
    });

    expect(message.title).toBe('Settings file is invalid.');
    expect(message.action).not.toContain('Unexpected token');
  });
});

describe('activity messages', () => {
  it('maps save outcomes to friendly activity codes', () => {
    const success = activityDetailsForSaveResult({ ok: true, value: { profiles: [] } });
    const failure = activityDetailsForSaveResult({
      ok: false,
      code: 'invalid_index_json',
      message: 'Unexpected token at byte 2',
    });

    expect(success.friendlyCode).toBe('save_profile_succeeded');
    expect(failure.friendlyCode).toBe('save_profile_failed');
    expect(failure.message).not.toContain('Unexpected token');
  });

  it('maps apply and restore failures without raw technical details', () => {
    const apply = activityDetailsForApplyResult({
      ok: false,
      code: 'invalid_profile_json',
      message: 'SyntaxError: Unexpected token',
    });
    const restore = activityDetailsForRestoreResult({
      ok: false,
      code: 'invalid_backup_json',
      message: 'SyntaxError: Unexpected token',
    });

    expect(apply).toMatchObject({
      friendlyCode: 'apply_profile_failed',
      title: 'Profile settings are invalid.',
    });
    expect(restore).toMatchObject({
      friendlyCode: 'restore_backup_failed',
      title: 'Backup file is invalid.',
    });
    expect(apply.message).not.toContain('SyntaxError');
    expect(restore.message).not.toContain('SyntaxError');
  });

  it('keeps activity append failures secondary to the original operation', () => {
    const message = messageForActivityStoreResult({
      ok: false,
      code: 'save_failed',
      message: 'disk error',
      recoverable: false,
    });

    expect(message.title).toBe('Activity could not be saved.');
    expect(message.action).toContain('last operation still finished');
    expect(message.action).not.toContain('disk error');
    expect(message.tone).toBe('warning');
  });

  it('uses recovery prompts that preserve corrupted stores before reset', () => {
    const prompt = messageForLocalStoreRecoveryPrompt('profiles');
    const success = messageForLocalStoreRecoverySuccess(
      'activity',
      'C:/Users/Player/AppData/Local/lol-settings-changer/activity.corrupt-1.json',
    );

    expect(prompt.action).toContain('preserve');
    expect(prompt.action).toContain('empty profile list');
    expect(success.title).toBe('Activity recovered.');
    expect(success.action).toContain('preserved');
    expect(success.action).not.toContain('Unexpected token');
  });
});

describe('messageForWriteResult', () => {
  it('shows automatic rollback after write failure', () => {
    const message = messageForWriteResult({
      ok: false,
      code: 'write_failed_rollback_succeeded',
      message: 'technical detail',
      backupPath: 'backup.json',
    });

    expect(message.title).toBe('Write failed.');
    expect(message.action).toContain('restored automatically');
  });
});

describe('profile workflow messages', () => {
  it('shows profile save success without exposing storage details', () => {
    const message = messageForProfileStoreResult({ ok: true, value: { profiles: [] } });

    expect(message.title).toBe('Profile saved.');
    expect(message.tone).toBe('success');
  });

  it('shows profile rename success separately from save success', () => {
    const message = messageForProfileRenameResult({ ok: true, value: { profiles: [] } });

    expect(message.title).toBe('Profile updated.');
    expect(message.action).toContain('Name and tags');
  });

  it('maps typed delete mismatch to a clear warning', () => {
    const message = messageForProfileDeleteResult({
      ok: false,
      code: 'delete_confirmation_mismatch',
      message: 'technical detail',
    });

    expect(message.title).toBe('Profile name did not match.');
    expect(message.action).not.toContain('technical');
    expect(message.tone).toBe('warning');
  });

  it('shows delete success as local-only profile removal', () => {
    const message = messageForProfileDeleteResult({ ok: true, value: { profiles: [] } });

    expect(message.title).toBe('Profile deleted.');
    expect(message.action).toContain('saved profile entry');
  });

  it('mentions backup creation after apply success', () => {
    const message = messageForApplyResult({
      ok: true,
      backup: { path: 'backup.json', sourcePath: 'PersistedSettings.json', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(message.title).toBe('Profile applied.');
    expect(message.action).toContain('backup was created');
  });

  it('maps invalid profile JSON to a clear apply error', () => {
    const message = messageForApplyResult({
      ok: false,
      code: 'invalid_profile_json',
      message: 'technical detail',
    });

    expect(message.title).toBe('Profile settings are invalid.');
    expect(message.action).not.toContain('technical');
  });

  it('shows backup creation after restore success', () => {
    const message = messageForRestoreResult({
      ok: true,
      backup: { path: 'backup.json', sourcePath: 'PersistedSettings.json', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(message.title).toBe('Backup restored.');
    expect(message.action).toContain('backed up before restoring');
  });

  it('maps missing backup restore failures to a clear message', () => {
    const message = messageForRestoreResult({
      ok: false,
      code: 'missing_backup',
      message: 'technical detail',
    });

    expect(message.title).toBe('Backup file not found.');
    expect(message.action).not.toContain('technical');
  });
});
