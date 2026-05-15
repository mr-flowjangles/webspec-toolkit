import { describe, expect, it } from 'vitest';
import { deriveSlug } from '../../src/library/slug.js';

describe('deriveSlug', () => {
  it('lowercases', () => {
    expect(deriveSlug('Login Flow')).toBe('login-flow');
  });

  it('replaces non-alphanumeric runs with a single dash', () => {
    expect(deriveSlug('Create Lead — UCM NexGen')).toBe('create-lead-ucm-nexgen');
  });

  it('collapses consecutive dashes', () => {
    expect(deriveSlug('foo---bar')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(deriveSlug('--foo--')).toBe('foo');
  });

  it('handles apostrophes and other punctuation', () => {
    expect(deriveSlug("it's a test")).toBe('it-s-a-test');
  });

  it('caps at 64 chars and trims a trailing dash from the truncation', () => {
    const long = 'a-very-long-test-case-name-that-runs-on-and-on-past-the-limit-and-beyond';
    const slug = deriveSlug(long);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns empty string for input with no slug-able chars', () => {
    expect(deriveSlug('---')).toBe('');
    expect(deriveSlug('!!!')).toBe('');
  });

  it('preserves digits', () => {
    expect(deriveSlug('Test 1 — Step 2')).toBe('test-1-step-2');
  });

  it('returns empty string for non-string input (defensive)', () => {
    // @ts-expect-error — verifying defensive guard
    expect(deriveSlug(null)).toBe('');
    // @ts-expect-error — verifying defensive guard
    expect(deriveSlug(undefined)).toBe('');
  });
});
