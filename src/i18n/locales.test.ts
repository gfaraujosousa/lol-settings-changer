import { describe, expect, it } from 'vitest';
import { interpolate } from './LocaleContext';
import { detectLocale, isLocale } from './locales';

describe('detectLocale', () => {
  it('accepts known locale codes', () => {
    expect(isLocale('pt-BR')).toBe(true);
    expect(isLocale('nope')).toBe(false);
  });

  it('falls back to English without navigator hints', () => {
    const storage = globalThis.localStorage;
    storage?.removeItem('lol-settings-changer.locale');
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-US' } });
    expect(detectLocale()).toBe('en');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
  });

  it('maps Portuguese navigator language to pt-BR', () => {
    const storage = globalThis.localStorage;
    storage?.removeItem('lol-settings-changer.locale');
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'pt-BR' } });
    expect(detectLocale()).toBe('pt-BR');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
  });
});

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('Apply {name}?', { name: 'Lane swap' })).toBe('Apply Lane swap?');
  });
});
