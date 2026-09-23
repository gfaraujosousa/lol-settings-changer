export const PROFILE_ICON_IDS = [
  'horned-gear',
  'contract',
  'yellow-eye',
  'hex-crystal',
  'crossed-blades',
] as const;

export type ProfileIconId = (typeof PROFILE_ICON_IDS)[number];

export const DEFAULT_PROFILE_ICON_ID: ProfileIconId = 'horned-gear';

export const PROFILE_ICON_LABELS: Record<ProfileIconId, string> = {
  'horned-gear': 'Horned gear',
  contract: 'Contract',
  'yellow-eye': 'Yellow eye',
  'hex-crystal': 'Hex crystal',
  'crossed-blades': 'Crossed blades',
};

export function isProfileIconId(value: unknown): value is ProfileIconId {
  return typeof value === 'string' && (PROFILE_ICON_IDS as readonly string[]).includes(value);
}

export function normalizeProfileIconId(value: unknown): ProfileIconId {
  return isProfileIconId(value) ? value : DEFAULT_PROFILE_ICON_ID;
}
