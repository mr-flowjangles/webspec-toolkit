/**
 * chrome.storage.local accessors for v1.3 AuthProfile data.
 *
 * Single key — `webspec.authProfiles` — holds the full `AuthProfileList`.
 * Read/write is round-tripped through zod so a malformed profile (from a
 * future schema bump or a hand-edited storage entry) won't crash the popup.
 */
import { AuthProfileListSchema, type AuthProfile, type AuthProfileList } from '@webspec/core/browser';

const STORAGE_KEY = 'webspec.authProfiles';

export async function loadProfiles(): Promise<AuthProfileList> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (raw === undefined) return [];
    const parsed = AuthProfileListSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('[webspec] auth profiles failed to parse; ignoring:', parsed.error);
      return [];
    }
    return parsed.data;
  } catch (err) {
    console.warn('[webspec] failed to load auth profiles:', err);
    return [];
  }
}

export async function saveProfiles(profiles: AuthProfileList): Promise<void> {
  // Validate before write — refuse to persist a broken list. The settings UI
  // validates inputs but storage is the last guard.
  AuthProfileListSchema.parse(profiles);
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
}

export function blankProfile(): AuthProfile {
  return {
    id: crypto.randomUUID(),
    name: '',
    urlPattern: '',
    headers: [{ name: '', value: '' }],
  };
}
