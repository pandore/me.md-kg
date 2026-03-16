import { describe, it, expect } from 'vitest';
import { jaroWinkler, normalizeForDedup } from '../src/extraction/dedup.js';

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('patricia', 'patricia')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', 'abc')).toBe(0);
    expect(jaroWinkler('abc', '')).toBe(0);
  });

  it('scores high for similar names', () => {
    expect(jaroWinkler('patricia', 'patrizia')).toBeGreaterThan(0.85);
    expect(jaroWinkler('podavach', 'podavach.store')).toBeGreaterThan(0.8);
  });

  it('scores low for very different names', () => {
    expect(jaroWinkler('patricia', 'oleksii')).toBeLessThan(0.7);
  });
});

describe('normalizeForDedup', () => {
  it('strips accents', () => {
    expect(normalizeForDedup('Patrícia')).toBe('patricia');
    expect(normalizeForDedup('José')).toBe('jose');
    expect(normalizeForDedup('München')).toBe('munchen');
  });

  it('strips corporate suffixes', () => {
    expect(normalizeForDedup('Podavach Inc')).toBe('podavach');
    expect(normalizeForDedup('Podavach Ltd.')).toBe('podavach');
    expect(normalizeForDedup('Google LLC')).toBe('google');
    expect(normalizeForDedup('Siemens GmbH')).toBe('siemens');
  });

  it('strips articles', () => {
    expect(normalizeForDedup('The New York Times')).toBe('new york times');
    expect(normalizeForDedup('An Organization')).toBe('organization');
  });

  it('lowercases and collapses whitespace', () => {
    expect(normalizeForDedup('  Oleksii   Nikitin  ')).toBe('oleksii nikitin');
  });
});
