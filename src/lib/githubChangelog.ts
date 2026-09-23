import { APP_VERSION, GITHUB_REPO } from '../i18n/locales';

export interface ChangelogRelease {
  id: string;
  tag: string;
  name: string;
  body: string;
  publishedAt: string | null;
  htmlUrl: string;
  source: 'local' | 'github-release' | 'github-commit';
}

export interface ChangelogResult {
  releases: ChangelogRelease[];
  source: 'releases' | 'commits' | 'local';
  error: string | null;
}

export type GetJson = <T>(url: string) => Promise<{ ok: boolean; data: T | null }>;

export const LOCAL_RELEASE: ChangelogRelease = {
  id: `local-${APP_VERSION}`,
  tag: `v${APP_VERSION}`,
  name: `${APP_VERSION} Helluva desk`,
  body: [
    'Visual rebrand inspired by Helluva Boss title cards (original art, no copied characters).',
    'Tabs for Start, Desk, History, and News, with denser layout for the installed window.',
    'Onboarding guide, Ko-fi support link, and UI in English, Portuguese, Spanish, French, Chinese, Korean, and German.',
    'Profile badge icons, system tray idle mode, and a hidden Windows console in release builds.',
  ].join('\n'),
  publishedAt: '2026-09-23',
  htmlUrl: `https://github.com/${GITHUB_REPO}/releases/tag/v${APP_VERSION}`,
  source: 'local',
};

interface GithubReleaseJson {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  html_url: string;
}

interface GithubCommitJson {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string } | null;
  };
}

export function mapGithubReleases(payload: GithubReleaseJson[]): ChangelogRelease[] {
  return payload.map((release) => ({
    id: `gh-${release.id}`,
    tag: release.tag_name,
    name: release.name?.trim() || release.tag_name,
    body: (release.body ?? '').trim(),
    publishedAt: release.published_at,
    htmlUrl: release.html_url,
    source: 'github-release',
  }));
}

export function mapGithubCommits(payload: GithubCommitJson[]): ChangelogRelease[] {
  return payload.map((commit) => {
    const [title, ...rest] = commit.commit.message.split('\n');
    return {
      id: commit.sha,
      tag: commit.sha.slice(0, 7),
      name: title.trim(),
      body: rest.join('\n').trim(),
      publishedAt: commit.commit.author?.date ?? null,
      htmlUrl: commit.html_url,
      source: 'github-commit',
    };
  });
}

export function mergeChangelog(github: ChangelogRelease[]): ChangelogRelease[] {
  const hasCurrent = github.some((item) => item.tag === LOCAL_RELEASE.tag || item.name.includes(APP_VERSION));
  if (hasCurrent) {
    return github;
  }
  if (github.length === 0) {
    return [LOCAL_RELEASE];
  }
  return [LOCAL_RELEASE, ...github];
}

export async function defaultGetJson<T>(url: string): Promise<{ ok: boolean; data: T | null }> {
  try {
    const http = await import('@tauri-apps/api/http');
    const response = await http.fetch<T>(url, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lol-settings-changer' },
      responseType: http.ResponseType.JSON,
    });
    return { ok: response.ok, data: response.ok ? response.data : null };
  } catch {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lol-settings-changer' },
      });
      if (!response.ok) {
        return { ok: false, data: null };
      }
      return { ok: true, data: (await response.json()) as T };
    } catch {
      return { ok: false, data: null };
    }
  }
}

export async function fetchGithubChangelog(getJson: GetJson = defaultGetJson): Promise<ChangelogResult> {
  const releasesUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`;
  const commitsUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=12`;

  try {
    const releasesResponse = await getJson<GithubReleaseJson[]>(releasesUrl);
    if (releasesResponse.ok && Array.isArray(releasesResponse.data) && releasesResponse.data.length > 0) {
      return {
        releases: mergeChangelog(mapGithubReleases(releasesResponse.data)),
        source: 'releases',
        error: null,
      };
    }

    const commitsResponse = await getJson<GithubCommitJson[]>(commitsUrl);
    if (!commitsResponse.ok || !Array.isArray(commitsResponse.data)) {
      return { releases: [LOCAL_RELEASE], source: 'local', error: 'github' };
    }

    return {
      releases: mergeChangelog(mapGithubCommits(commitsResponse.data)),
      source: 'commits',
      error: null,
    };
  } catch {
    return { releases: [LOCAL_RELEASE], source: 'local', error: 'github' };
  }
}
