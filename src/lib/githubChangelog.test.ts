import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../i18n/locales';
import {
  fetchGithubChangelog,
  LOCAL_RELEASE,
  mapGithubCommits,
  mapGithubReleases,
  mergeChangelog,
  type GetJson,
} from './githubChangelog';

describe('githubChangelog', () => {
  it('maps GitHub releases', () => {
    const mapped = mapGithubReleases([
      {
        id: 1,
        tag_name: 'v0.1.0',
        name: 'Initial',
        body: 'First ship',
        published_at: '2026-01-01T00:00:00Z',
        html_url: 'https://example.com/r',
      },
    ]);

    expect(mapped[0]).toMatchObject({ tag: 'v0.1.0', name: 'Initial', source: 'github-release' });
  });

  it('maps commits to changelog cards', () => {
    const mapped = mapGithubCommits([
      {
        sha: 'abcdef123456',
        html_url: 'https://example.com/c',
        commit: { message: 'Fix tray icon\n\nRGBA required', author: { date: '2026-09-23T00:00:00Z' } },
      },
    ]);

    expect(mapped[0].tag).toBe('abcdef1');
    expect(mapped[0].name).toBe('Fix tray icon');
    expect(mapped[0].body).toContain('RGBA');
  });

  it('prepends the local 0.2.0 notes when GitHub has no matching release', () => {
    const merged = mergeChangelog([]);
    expect(merged[0]).toEqual(LOCAL_RELEASE);
    expect(merged[0].tag).toBe(`v${APP_VERSION}`);
  });

  it('keeps GitHub notes first when the current tag already exists', () => {
    const current = { ...LOCAL_RELEASE, source: 'github-release' as const };
    expect(mergeChangelog([current])[0]).toEqual(current);
  });

  it('falls back to commits when there are no GitHub releases', async () => {
    const getJson: GetJson = async (url) => {
      if (url.includes('/releases')) {
        return { ok: true, data: [] as never };
      }
      return {
        ok: true,
        data: [
          {
            sha: 'deadbeef0001',
            html_url: 'https://example.com/c',
            commit: { message: 'Polish layout', author: { date: '2026-09-23T00:00:00Z' } },
          },
        ] as never,
      };
    };

    const result = await fetchGithubChangelog(getJson);

    expect(result.source).toBe('commits');
    expect(result.releases[0]).toEqual(LOCAL_RELEASE);
    expect(result.releases[1]?.name).toBe('Polish layout');
  });
});
