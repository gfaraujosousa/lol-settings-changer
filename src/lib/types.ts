export type PathStatusKind = 'not_selected' | 'missing' | 'wrong_file' | 'invalid_json' | 'valid';

export interface PathStatus {
  kind: PathStatusKind;
  path: string | null;
  detail?: string;
}

export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  listFiles(directory: string): Promise<string[]>;
  ensureDir(directory: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
