import { describe, expect, it } from 'vitest';
import { compareVersions, checkAppUpdate, evaluateUpdate, pickWindowsInstaller, type GithubLatestRelease } from './appUpdate';

const release = (overrides: Partial<GithubLatestRelease> = {}): GithubLatestRelease => ({
  tag_name: 'v0.3.0',
  name: 'Desk polish',
  body: 'Tabs and updates',
  html_url: 'https://github.com/gfaraujosousa/lol-settings-changer/releases/tag/v0.3.0',
  assets: [
    {
      name: 'LoL Settings Changer_0.3.0_x64-setup.exe',
      browser_download_url:
        'https://github.com/gfaraujosousa/lol-settings-changer/releases/download/v0.3.0/LoL%20Settings%20Changer_0.3.0_x64-setup.exe',
    },
  ],
  ...overrides,
});

describe('appUpdate', () => {
  it('compares dotted versions', () => {
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('v0.3.0', '0.2.0')).toBe(1);
    expect(compareVersions('0.2.1', '0.10.0')).toBe(-1);
  });

  it('prefers the NSIS setup asset', () => {
    const picked = pickWindowsInstaller([
      { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
      { name: 'app.msi', browser_download_url: 'https://example.com/app.msi' },
      {
        name: 'LoL Settings Changer_0.3.0_x64-setup.exe',
        browser_download_url: 'https://example.com/setup.exe',
      },
    ]);
    expect(picked?.name).toContain('setup.exe');
  });

  it('reports an available update', () => {
    const result = evaluateUpdate('0.2.0', release(), null);
    expect(result.status).toBe('available');
    if (result.status === 'available') {
      expect(result.latest).toBe('0.3.0');
      expect(result.installerName).toContain('setup.exe');
    }
  });

  it('hides a skipped version unless ignoreSkipped is set', () => {
    expect(evaluateUpdate('0.2.0', release(), '0.3.0').status).toBe('current');
    expect(evaluateUpdate('0.2.0', release(), '0.3.0', true).status).toBe('available');
  });

  it('treats equal or older GitHub tags as current', () => {
    expect(evaluateUpdate('0.2.0', release({ tag_name: 'v0.2.0' }), null).status).toBe('current');
    expect(evaluateUpdate('0.2.0', release({ tag_name: 'v0.1.0' }), null).status).toBe('current');
  });

  it('maps a GitHub latest payload through checkAppUpdate', async () => {
    const result = await checkAppUpdate({
      current: '0.2.0',
      ignoreSkipped: true,
      getJson: async () => ({ ok: true, data: release() as never }),
    });
    expect(result.status).toBe('available');
  });
});
