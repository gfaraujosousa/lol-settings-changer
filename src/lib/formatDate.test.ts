import { describe, expect, it } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    const result = formatDate('2024-06-15T14:30:00.000Z', 'en-US');
    expect(result).toBe(new Date('2024-06-15T14:30:00.000Z').toLocaleString('en-US'));
  });

  it('formats unix millis strings', () => {
    const millis = '1735689600000';
    const result = formatDate(millis, 'en-US');
    expect(result).toBe(new Date(Number(millis)).toLocaleString('en-US'));
  });

  it('formats unix seconds strings', () => {
    const seconds = '1735689600';
    const result = formatDate(seconds, 'en-US');
    expect(result).toBe(new Date(Number(seconds) * 1000).toLocaleString('en-US'));
  });

  it('returns garbage input unchanged', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('')).toBe('');
  });
});
