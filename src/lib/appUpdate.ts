import { APP_VERSION, GITHUB_REPO } from '../i18n/locales';
import { defaultGetJson, type GetJson } from './githubChangelog';
import { openExternal } from './openExternal';

export const SKIPPED_UPDATE_KEY = 'lol-settings-changer.skipped-update';

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GithubLatestRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: GithubReleaseAsset[];
}

export interface AvailableUpdate {
  status: 'available';
  current: string;
  latest: string;
  name: string;
  notes: string;
  htmlUrl: string;
  installerUrl: string | null;
  installerName: string | null;
}

export type UpdateCheck =
  | { status: 'unavailable'; error: string | null }
  | { status: 'current'; current: string; latest: string }
  | AvailableUpdate;

export function normalizeVersion(input: string): string {
  return input
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/)[0]
    .trim();
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff > 0) {
      return 1;
    }
    if (diff < 0) {
      return -1;
    }
  }
  return 0;
}

export function pickWindowsInstaller(assets: GithubReleaseAsset[]): GithubReleaseAsset | null {
  const installers = assets.filter((asset) => asset.name.toLowerCase().endsWith('.exe'));
  return (
    installers.find((asset) => /setup\.exe$/i.test(asset.name)) ??
    installers.find((asset) => /x64/i.test(asset.name)) ??
    installers[0] ??
    null
  );
}

export function readSkippedUpdate(): string | null {
  try {
    return globalThis.localStorage?.getItem(SKIPPED_UPDATE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function skipUpdate(version: string) {
  try {
    globalThis.localStorage?.setItem(SKIPPED_UPDATE_KEY, normalizeVersion(version));
  } catch {
    // ignore
  }
}

export function clearSkippedUpdate() {
  try {
    globalThis.localStorage?.removeItem(SKIPPED_UPDATE_KEY);
  } catch {
    // ignore
  }
}

export function evaluateUpdate(
  current: string,
  release: GithubLatestRelease | null,
  skippedVersion: string | null,
  ignoreSkipped = false,
): UpdateCheck {
  if (!release || release.draft) {
    return { status: 'unavailable', error: null };
  }

  const latest = normalizeVersion(release.tag_name);
  if (!latest) {
    return { status: 'unavailable', error: 'github' };
  }

  if (compareVersions(latest, current) <= 0) {
    return { status: 'current', current: normalizeVersion(current), latest };
  }

  if (!ignoreSkipped && skippedVersion && compareVersions(skippedVersion, latest) === 0) {
    return { status: 'current', current: normalizeVersion(current), latest };
  }

  const installer = pickWindowsInstaller(release.assets ?? []);
  return {
    status: 'available',
    current: normalizeVersion(current),
    latest,
    name: release.name?.trim() || `v${latest}`,
    notes: (release.body ?? '').trim(),
    htmlUrl: release.html_url,
    installerUrl: installer?.browser_download_url ?? null,
    installerName: installer?.name ?? null,
  };
}

export async function checkAppUpdate(
  options: { current?: string; ignoreSkipped?: boolean; getJson?: GetJson } = {},
): Promise<UpdateCheck> {
  const current = options.current ?? APP_VERSION;
  const getJson = options.getJson ?? defaultGetJson;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  try {
    const response = await getJson<GithubLatestRelease>(url);
    if (!response.ok || !response.data) {
      if (response.ok) {
        return { status: 'current', current: normalizeVersion(current), latest: normalizeVersion(current) };
      }
      return { status: 'unavailable', error: 'github' };
    }

    return evaluateUpdate(current, response.data, readSkippedUpdate(), options.ignoreSkipped ?? false);
  } catch {
    return { status: 'unavailable', error: 'github' };
  }
}

export async function startUpdateInstall(update: AvailableUpdate): Promise<'installed' | 'opened'> {
  if (update.installerUrl && update.installerName) {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      await invoke('install_app_update', {
        url: update.installerUrl,
        fileName: update.installerName,
      });
      return 'installed';
    } catch {
      await openExternal(update.htmlUrl);
      return 'opened';
    }
  }

  await openExternal(update.htmlUrl);
  return 'opened';
}
