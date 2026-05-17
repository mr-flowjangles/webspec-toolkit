import { describe, expect, it } from 'vitest';
import {
  matchProfile,
  resolveProfileHeaders,
  type AuthProfile,
} from '../../src/library/auth-profile.js';

const UCM_DEV: AuthProfile = {
  id: 'ucm-dev',
  name: 'UCM Dev',
  urlPattern: 'http://app.ucm-dev.cmscloud.local/*',
  headers: [{ name: 'uid', value: '${runAs}' }],
};

const UCM_TEST: AuthProfile = {
  id: 'ucm-test',
  name: 'UCM Test',
  urlPattern: 'http://app.ucm-test.cmscloud.local/*',
  headers: [{ name: 'uid', value: '${runAs}' }],
};

const UCM_DEV_NARROW: AuthProfile = {
  id: 'ucm-dev-narrow',
  name: 'UCM Dev (narrow path)',
  urlPattern: 'http://app.ucm-dev.cmscloud.local/admin/*',
  headers: [{ name: 'uid', value: '${runAs}' }, { name: 'role', value: 'admin' }],
};

describe('matchProfile', () => {
  it('finds the only matching profile', () => {
    const result = matchProfile([UCM_DEV, UCM_TEST], 'http://app.ucm-dev.cmscloud.local/trackers');
    expect(result).toBe(UCM_DEV);
  });

  it('returns null when no profile matches', () => {
    const result = matchProfile([UCM_DEV], 'http://other.example.com/');
    expect(result).toBeNull();
  });

  it('returns null on an empty profile list', () => {
    expect(matchProfile([], 'http://anything')).toBeNull();
  });

  it('prefers the most-specific (longest-pattern) profile when multiple match', () => {
    const result = matchProfile([UCM_DEV, UCM_DEV_NARROW], 'http://app.ucm-dev.cmscloud.local/admin/users');
    expect(result).toBe(UCM_DEV_NARROW);
  });

  it('falls back to the broader profile when the narrow one does not match', () => {
    const result = matchProfile([UCM_DEV, UCM_DEV_NARROW], 'http://app.ucm-dev.cmscloud.local/trackers');
    expect(result).toBe(UCM_DEV);
  });
});

describe('resolveProfileHeaders', () => {
  it('substitutes ${runAs} in header values', () => {
    expect(resolveProfileHeaders(UCM_DEV, 'TTIDUMWSUP')).toEqual({ uid: 'TTIDUMWSUP' });
  });

  it('handles literal header values unchanged', () => {
    expect(resolveProfileHeaders(UCM_DEV_NARROW, 'TTIDUMWSUP')).toEqual({
      uid: 'TTIDUMWSUP',
      role: 'admin',
    });
  });

  it('substitutes case-insensitively', () => {
    const profile: AuthProfile = {
      ...UCM_DEV,
      headers: [{ name: 'uid', value: '${RUNAS}' }],
    };
    expect(resolveProfileHeaders(profile, 'JOE')).toEqual({ uid: 'JOE' });
  });

  it('replaces multiple occurrences', () => {
    const profile: AuthProfile = {
      ...UCM_DEV,
      headers: [{ name: 'x', value: '${runAs}-${runAs}' }],
    };
    expect(resolveProfileHeaders(profile, 'JOE')).toEqual({ x: 'JOE-JOE' });
  });

  it('returns empty when no headers', () => {
    const profile: AuthProfile = { ...UCM_DEV, headers: [] };
    expect(resolveProfileHeaders(profile, 'JOE')).toEqual({});
  });
});
