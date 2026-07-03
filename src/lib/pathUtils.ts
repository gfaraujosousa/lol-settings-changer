export const SETTINGS_FILE_NAME = 'PersistedSettings.json';
export const DEFAULT_SETTINGS_PATH = 'C:\\Riot Games\\League of Legends\\Config\\PersistedSettings.json';

export function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

export function baseName(path: string): string {
  const normalized = normalizeSeparators(path.trim());
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

export function parentDir(path: string): string {
  const trimmed = path.trim();
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return slash >= 0 ? trimmed.slice(0, slash) : '.';
}

export function safeFileToken(path: string): string {
  return normalizeSeparators(path)
    .replace(/^[A-Za-z]:/, (drive) => drive[0].toLowerCase())
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
