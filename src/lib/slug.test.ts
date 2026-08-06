import { describe, it, expect } from 'vitest';
import { generateRandomSlug, normalizeSlug, isValidSlug, MAX_SLUG_LENGTH } from './slug';

describe('generateRandomSlug', () => {
  it('produces adjective-noun-<8 chars> in the safe alphabet', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRandomSlug()).toMatch(/^[a-z]+-[a-z]+-[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
    }
  });

  it('always survives its own validator', () => {
    for (let i = 0; i < 50; i++) {
      const slug = generateRandomSlug();
      expect(isValidSlug(slug)).toBe(true);
      expect(normalizeSlug(slug)).toBe(slug);
    }
  });

  it('does not repeat across a large sample', () => {
    const seen = new Set(Array.from({ length: 2000 }, generateRandomSlug));
    expect(seen.size).toBe(2000);
  });
});

describe('normalizeSlug', () => {
  it('lowercases and strips anything outside [a-z0-9-]', () => {
    expect(normalizeSlug('  Quiet-FOX-4821 ')).toBe('quiet-fox-4821');
    expect(normalizeSlug('quiet fox')).toBe('quietfox');
    expect(normalizeSlug('../../etc/passwd')).toBe('etcpasswd');
    expect(normalizeSlug("robert'); drop table rooms;--")).toBe('robertdroptablerooms');
  });

  it('collapses and trims hyphens so one room has one spelling', () => {
    expect(normalizeSlug('--quiet---fox--')).toBe('quiet-fox');
  });

  it('caps the length', () => {
    expect(normalizeSlug('a'.repeat(500))).toHaveLength(MAX_SLUG_LENGTH);
  });

  it('returns an empty string for non-strings and empty input', () => {
    expect(normalizeSlug(undefined)).toBe('');
    expect(normalizeSlug(null)).toBe('');
    expect(normalizeSlug(42)).toBe('');
    expect(normalizeSlug({})).toBe('');
    expect(normalizeSlug('!!!')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('requires at least 3 characters of the allowed alphabet', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('Abc')).toBe(false);
    expect(isValidSlug('a b')).toBe(false);
    expect(isValidSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });
});
