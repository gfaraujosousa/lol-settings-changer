import type { Clock, FileSystemAdapter } from './types';
import { parentDir, safeFileToken, timestampForFile } from './pathUtils';

export interface BackupRecord {
  path: string;
  sourcePath: string;
  createdAt: string;
}

export interface BackupStoreOptions {
  backupRoot: string;
  retentionCount?: number;
}

export class BackupStore {
  private readonly retentionCount: number;

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly clock: Clock,
    private readonly options: BackupStoreOptions,
  ) {
    this.retentionCount = options.retentionCount ?? 10;
  }

  async createBackup(sourcePath: string): Promise<BackupRecord> {
    const sourceDir = parentDir(sourcePath);
    const sourceToken = safeFileToken(sourcePath);
    const createdAt = this.clock.now().toISOString();
    const fileName = `${timestampForFile(new Date(createdAt))}-${sourceToken}.json`;
    const backupDir = `${this.options.backupRoot}/${sourceToken || 'settings'}`;
    const backupPath = `${backupDir}/${fileName}`;

    await this.fs.ensureDir(backupDir);
    await this.fs.copyFile(sourcePath, backupPath);
    await this.enforceRetention(backupDir);

    return {
      path: backupPath,
      sourcePath: sourceDir,
      createdAt,
    };
  }

  async restoreBackup(backupPath: string, targetPath: string): Promise<void> {
    await this.fs.copyFile(backupPath, targetPath);
  }

  async listBackups(sourcePath: string): Promise<BackupRecord[]> {
    const sourceToken = safeFileToken(sourcePath);
    const backupDir = `${this.options.backupRoot}/${sourceToken || 'settings'}`;
    if (!(await this.fs.exists(backupDir))) {
      return [];
    }

    const files = await this.fs.listFiles(backupDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .map((path) => ({
        path,
        sourcePath,
        createdAt: createdAtFromBackupPath(path),
      }));
  }

  private async enforceRetention(backupDir: string): Promise<void> {
    const files = await this.fs.listFiles(backupDir);
    const newestFirst = files
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));

    const stale = newestFirst.slice(this.retentionCount);
    await Promise.all(stale.map((file) => this.fs.removeFile(file)));
  }
}

function createdAtFromBackupPath(path: string): string {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const isoLike = fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/i);
  if (isoLike) {
    return `${isoLike[1]}:${isoLike[2]}:${isoLike[3]}.${isoLike[4]}Z`;
  }

  const millis = fileName.match(/^(\d{10,})-/);
  if (millis) {
    return new Date(Number(millis[1])).toISOString();
  }

  return fileName;
}
