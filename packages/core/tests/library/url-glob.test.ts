import { describe, expect, it } from 'vitest';
import { matchesUrlGlob } from '../../src/library/url-glob.js';

describe('matchesUrlGlob', () => {
  it('matches a trailing wildcard against any path', () => {
    expect(matchesUrlGlob('http://app.ucm-dev.cmscloud.local/*', 'http://app.ucm-dev.cmscloud.local/foo/bar')).toBe(true);
    expect(matchesUrlGlob('http://app.ucm-dev.cmscloud.local/*', 'http://app.ucm-dev.cmscloud.local/')).toBe(true);
  });

  it('rejects URLs that do not start with the pattern prefix', () => {
    expect(matchesUrlGlob('http://app.ucm-dev.cmscloud.local/*', 'http://app.ucm-test.cmscloud.local/foo')).toBe(false);
    expect(matchesUrlGlob('http://app.ucm-dev.cmscloud.local/*', 'https://app.ucm-dev.cmscloud.local/foo')).toBe(false);
  });

  it('anchors at both ends — no leading partial match', () => {
    expect(matchesUrlGlob('http://app/*', 'evilhttp://app/foo')).toBe(false);
  });

  it('handles a middle wildcard', () => {
    expect(matchesUrlGlob('https://*.example.com/admin/*', 'https://staging.example.com/admin/users')).toBe(true);
    expect(matchesUrlGlob('https://*.example.com/admin/*', 'https://example.com/admin/users')).toBe(false);
  });

  it('escapes regex metacharacters in the pattern', () => {
    expect(matchesUrlGlob('http://app.example.com/path?query=*', 'http://app.example.com/path?query=foo')).toBe(true);
    // `.` in pattern is literal — must not act as a wildcard.
    expect(matchesUrlGlob('http://app.example.com/', 'http://appXexample.com/')).toBe(false);
  });

  it('returns false on empty pattern', () => {
    expect(matchesUrlGlob('', 'http://example.com')).toBe(false);
  });

  it('returns false on non-string inputs (defensive)', () => {
    // @ts-expect-error — verifying defensive guard
    expect(matchesUrlGlob(null, 'http://example.com')).toBe(false);
    // @ts-expect-error — verifying defensive guard
    expect(matchesUrlGlob('http://*', undefined)).toBe(false);
  });

  it('matches an exact URL (no wildcard)', () => {
    expect(matchesUrlGlob('http://example.com/foo', 'http://example.com/foo')).toBe(true);
    expect(matchesUrlGlob('http://example.com/foo', 'http://example.com/foo/bar')).toBe(false);
  });
});
