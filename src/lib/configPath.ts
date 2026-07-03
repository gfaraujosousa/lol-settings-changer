import type { FileSystemAdapter, PathStatus } from './types';
import { DEFAULT_SETTINGS_PATH, SETTINGS_FILE_NAME, baseName } from './pathUtils';

const SELECTED_PATH_KEY = 'selectedSettingsPath';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class BrowserKeyValueStore implements KeyValueStore {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  private values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

export async function detectDefaultSettingsPath(fs: FileSystemAdapter): Promise<string | null> {
  return (await fs.exists(DEFAULT_SETTINGS_PATH)) ? DEFAULT_SETTINGS_PATH : null;
}

export async function loadSelectedPath(store: KeyValueStore): Promise<string | null> {
  return store.getItem(SELECTED_PATH_KEY);
}

export async function saveSelectedPath(store: KeyValueStore, path: string): Promise<void> {
  await store.setItem(SELECTED_PATH_KEY, path.trim());
}

export async function resolveInitialPath(
  fs: FileSystemAdapter,
  store: KeyValueStore,
): Promise<string | null> {
  const stored = await loadSelectedPath(store);
  if (stored) {
    return stored;
  }

  return detectDefaultSettingsPath(fs);
}

export async function validateSettingsPath(fs: FileSystemAdapter, path: string | null): Promise<PathStatus> {
  const selectedPath = path?.trim() ?? '';
  if (!selectedPath) {
    return { kind: 'not_selected', path: null };
  }

  if (baseName(selectedPath) !== SETTINGS_FILE_NAME) {
    return { kind: 'wrong_file', path: selectedPath };
  }

  if (!(await fs.exists(selectedPath))) {
    return { kind: 'missing', path: selectedPath };
  }

  try {
    JSON.parse(await fs.readText(selectedPath));
  } catch (error) {
    return {
      kind: 'invalid_json',
      path: selectedPath,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return { kind: 'valid', path: selectedPath };
}
