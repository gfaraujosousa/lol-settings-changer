import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_ICON_ID,
  PROFILE_ICON_IDS,
  normalizeProfileIconId,
} from './profileIcons';

describe('normalizeProfileIconId', () => {
  it('keeps a known icon id', () => {
    expect(normalizeProfileIconId('hex-crystal')).toBe('hex-crystal');
    expect(PROFILE_ICON_IDS).toHaveLength(5);
  });

  it('falls back to the default badge for missing or unknown values', () => {
    expect(normalizeProfileIconId(undefined)).toBe(DEFAULT_PROFILE_ICON_ID);
    expect(normalizeProfileIconId('not-an-icon')).toBe(DEFAULT_PROFILE_ICON_ID);
  });
});
