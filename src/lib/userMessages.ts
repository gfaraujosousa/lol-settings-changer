import type { PathStatus } from './types';
import type { SafeWriteResult } from './settingsFile';
import type { ProfileActionResult } from './profileActions';
import type { ProfileStoreResult } from './profileStore';
import type { ActivityFriendlyCode, ActivityStoreResult } from './activityStore';

export interface UserMessage {
  title: string;
  action: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
}

export interface ActivityMessageDetails {
  title: string;
  message: string;
  friendlyCode: ActivityFriendlyCode;
}

export type RecoverableLocalStore = 'profiles' | 'activity';

export function messageForPathStatus(status: PathStatus): UserMessage {
  switch (status.kind) {
    case 'not_selected':
      return {
        title: 'No settings file selected.',
        action: 'Select PersistedSettings.json to continue.',
        tone: 'neutral',
      };
    case 'missing':
      return {
        title: 'Settings file not found.',
        action: 'Select the current PersistedSettings.json file.',
        tone: 'error',
      };
    case 'wrong_file':
      return {
        title: 'Wrong file selected.',
        action: 'Choose PersistedSettings.json.',
        tone: 'error',
      };
    case 'invalid_json':
      return {
        title: 'Settings file is invalid.',
        action: 'Choose a valid settings file or restore a backup.',
        tone: 'error',
      };
    case 'valid':
      return {
        title: 'Settings file is ready.',
        action: 'This path can be used safely.',
        tone: 'success',
      };
  }
}

export function messageForWriteResult(result: SafeWriteResult): UserMessage {
  if (result.ok) {
    return {
      title: 'Settings saved safely.',
      action: 'A backup was created before writing.',
      tone: 'success',
    };
  }

  if (result.code === 'write_failed_rollback_succeeded') {
    return {
      title: 'Write failed.',
      action: 'Your previous settings were restored automatically.',
      tone: 'warning',
    };
  }

  if (result.code === 'write_failed_rollback_failed') {
    return {
      title: 'Write failed.',
      action: 'Restore the backup manually.',
      tone: 'error',
    };
  }

  return {
    title: result.message,
    action: result.backupPath ? 'Keep the backup path for recovery.' : 'Check the selected file and try again.',
    tone: 'error',
  };
}

export function messageForProfileStoreResult<T>(result: ProfileStoreResult<T>): UserMessage {
  if (result.ok) {
    return {
      title: 'Profile saved.',
      action: 'Your settings snapshot is available in saved profiles.',
      tone: 'success',
    };
  }

  return {
    title: result.message,
    action: 'Check the profile name, tags, and selected settings file.',
    tone: 'error',
  };
}

export function activityDetailsForSaveResult<T>(result: ProfileStoreResult<T>): ActivityMessageDetails {
  const message = messageForProfileStoreResult(result);

  return {
    title: message.title,
    message: message.action,
    friendlyCode: result.ok ? 'save_profile_succeeded' : 'save_profile_failed',
  };
}

function messageForProfileMutationFailure<T>(result: ProfileStoreResult<T>): UserMessage {
  if (result.ok) {
    return {
      title: 'Profile updated.',
      action: 'Name and tags were saved.',
      tone: 'success',
    };
  }

  if (result.code === 'profile_not_found') {
    return {
      title: 'Profile not found.',
      action: 'Refresh saved profiles and try again.',
      tone: 'error',
    };
  }

  if (result.code === 'delete_confirmation_mismatch') {
    return {
      title: 'Profile name did not match.',
      action: 'Type the exact profile name to delete it.',
      tone: 'warning',
    };
  }

  return {
    title: result.message,
    action: 'Check the profile name and tags.',
    tone: 'error',
  };
}

export function messageForProfileRenameResult<T>(result: ProfileStoreResult<T>): UserMessage {
  return messageForProfileMutationFailure(result);
}

export function messageForProfileDeleteResult<T>(result: ProfileStoreResult<T>): UserMessage {
  if (result.ok) {
    return {
      title: 'Profile deleted.',
      action: 'Only the saved profile entry was removed.',
      tone: 'success',
    };
  }

  return messageForProfileMutationFailure(result);
}

export function messageForApplyResult(result: ProfileActionResult): UserMessage {
  if (result.ok) {
    return {
      title: 'Profile applied.',
      action: 'A backup was created before writing.',
      tone: 'success',
    };
  }

  if (result.code === 'invalid_profile_json') {
    return {
      title: 'Profile settings are invalid.',
      action: 'Choose another profile or save this one again.',
      tone: 'error',
    };
  }

  return messageForWriteResult(result as SafeWriteResult);
}

export function activityDetailsForApplyResult(result: ProfileActionResult): ActivityMessageDetails {
  const message = messageForApplyResult(result);

  return {
    title: message.title,
    message: message.action,
    friendlyCode: result.ok ? 'apply_profile_succeeded' : 'apply_profile_failed',
  };
}

export function messageForRestoreResult(result: ProfileActionResult): UserMessage {
  if (result.ok) {
    return {
      title: 'Backup restored.',
      action: 'Your current settings were backed up before restoring.',
      tone: 'success',
    };
  }

  if (result.code === 'missing_backup') {
    return {
      title: 'Backup file not found.',
      action: 'Choose another recent backup.',
      tone: 'error',
    };
  }

  if (result.code === 'invalid_backup_json') {
    return {
      title: 'Backup file is invalid.',
      action: 'Choose a valid backup.',
      tone: 'error',
    };
  }

  return messageForWriteResult(result as SafeWriteResult);
}

export function activityDetailsForRestoreResult(result: ProfileActionResult): ActivityMessageDetails {
  const message = messageForRestoreResult(result);

  return {
    title: message.title,
    message: message.action,
    friendlyCode: result.ok ? 'restore_backup_succeeded' : 'restore_backup_failed',
  };
}

export function messageForActivityStoreResult<T>(result: ActivityStoreResult<T>): UserMessage {
  if (result.ok) {
    return {
      title: 'Activity saved.',
      action: 'Recent operations are up to date.',
      tone: 'success',
    };
  }

  if (result.recoverable) {
    return messageForLocalStoreRecoveryPrompt('activity');
  }

  return {
    title: 'Activity could not be saved.',
    action: 'Your last operation still finished; recent activity may be incomplete.',
    tone: 'warning',
  };
}

export function messageForLocalStoreRecoveryPrompt(store: RecoverableLocalStore): UserMessage {
  if (store === 'profiles') {
    return {
      title: 'Saved profiles need recovery.',
      action: 'Recover them to preserve the damaged file and start with an empty profile list.',
      tone: 'warning',
    };
  }

  return {
    title: 'Activity needs recovery.',
    action: 'Recover it to preserve the damaged file and start with an empty activity list.',
    tone: 'warning',
  };
}

export function messageForLocalStoreRecoverySuccess(
  store: RecoverableLocalStore,
  preservedPath: string | null | undefined,
): UserMessage {
  const label = store === 'profiles' ? 'Saved profiles' : 'Activity';
  const freshStore = store === 'profiles' ? 'profile list' : 'activity list';

  return {
    title: `${label} recovered.`,
    action: preservedPath
      ? `The damaged file was preserved before a fresh ${freshStore} was created.`
      : `A fresh ${freshStore} was created.`,
    tone: 'success',
  };
}
