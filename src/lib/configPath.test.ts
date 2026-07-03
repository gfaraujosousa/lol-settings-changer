import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempWorkspace, NodeFileSystemAdapter, writeSettingsFile, writeWrongFile } from '../test/fixtures';
import {
  MemoryKeyValueStore,
  loadSelectedPath,
  saveSelectedPath,
  validateSettingsPath,
} from './configPath';

let workspace: Awaited<ReturnType<typeof createTempWorkspace>>;

beforeEach(async () => {
  workspace = await createTempWorkspace();
});

afterEach(async () => {
  await workspace.cleanup();
});

describe('validateSettingsPath', () => {
  it('returns not_selected for empty path', async () => {
    const status = await validateSettingsPath(new NodeFileSystemAdapter(), '');

    expect(status.kind).toBe('not_selected');
  });

  it('rejects files not named PersistedSettings.json', async () => {
    const wrongFile = await writeWrongFile(workspace.root);
    const status = await validateSettingsPath(new NodeFileSystemAdapter(), wrongFile);

    expect(status.kind).toBe('wrong_file');
  });

  it('reports missing PersistedSettings.json', async () => {
    const status = await validateSettingsPath(
      new NodeFileSystemAdapter(),
      `${workspace.root}/PersistedSettings.json`,
    );

    expect(status.kind).toBe('missing');
  });

  it('reports invalid JSON', async () => {
    const file = await writeSettingsFile(workspace.root, '{bad json');
    const status = await validateSettingsPath(new NodeFileSystemAdapter(), file);

    expect(status.kind).toBe('invalid_json');
  });

  it('accepts valid PersistedSettings.json', async () => {
    const file = await writeSettingsFile(workspace.root);
    const status = await validateSettingsPath(new NodeFileSystemAdapter(), file);

    expect(status.kind).toBe('valid');
  });
});

describe('selected path persistence', () => {
  it('persists the manually selected path', async () => {
    const store = new MemoryKeyValueStore();
    const file = await writeSettingsFile(workspace.root);

    await saveSelectedPath(store, file);

    expect(await loadSelectedPath(store)).toBe(file);
  });
});
