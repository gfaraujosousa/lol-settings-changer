const KEEP_IN_TRAY_KEY = 'lol-settings-changer.keep-in-tray';

export function loadKeepInTray(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEEP_IN_TRAY_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveKeepInTray(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEEP_IN_TRAY_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures in restricted environments.
  }
}
