import { mkdtemp, rm, mkdir, readFile, writeFile, copyFile, readdir, unlink, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileSystemAdapter } from '../lib/types';
import { SETTINGS_FILE_NAME } from '../lib/pathUtils';

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async readText(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  async writeText(path: string, contents: string): Promise<void> {
    await writeFile(path, contents, 'utf8');
  }

  async copyFile(source: string, destination: string): Promise<void> {
    await copyFile(source, destination);
  }

  async removeFile(path: string): Promise<void> {
    await unlink(path);
  }

  async listFiles(directory: string): Promise<string[]> {
    const files = await readdir(directory);
    return files.map((file) => join(directory, file));
  }

  async ensureDir(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true });
  }

  async rename(source: string, destination: string): Promise<void> {
    await rename(source, destination);
  }
}

export class FailingRenameAdapter extends NodeFileSystemAdapter {
  async rename(): Promise<void> {
    throw new Error('simulated rename failure');
  }
}

export class FailingRollbackAdapter extends FailingRenameAdapter {
  async copyFile(source: string, destination: string): Promise<void> {
    if (destination.endsWith(SETTINGS_FILE_NAME) && source.includes('backups')) {
      throw new Error('simulated rollback failure');
    }

    await super.copyFile(source, destination);
  }
}

export async function createTempWorkspace(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'lol-settings-changer-'));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function writeSettingsFile(root: string, contents = '{"hudScale": 1}'): Promise<string> {
  const file = join(root, SETTINGS_FILE_NAME);
  await writeFile(file, contents, 'utf8');
  return file;
}

export async function writeWrongFile(root: string): Promise<string> {
  const file = join(root, 'settings.json');
  await writeFile(file, '{"hudScale": 1}', 'utf8');
  return file;
}

export function backupRoot(root: string): string {
  return join(root, 'backups');
}
