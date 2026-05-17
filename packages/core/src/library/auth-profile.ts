/**
 * AuthProfile — domain-aware auth config for the v1.3 test library.
 *
 * Lives in `chrome.storage.local` (set per browser profile via the extension's
 * Settings tab). At recording-start time, the extension matches the active
 * tab's URL against each profile's `urlPattern` and resolves the matched
 * profile's headers (substituting `${runAs}` with the recording's runAs
 * field) into `WorkflowRecording.auth`.
 *
 * See `docs/08-test-library.md` for the design.
 */
import { z } from 'zod';
import { matchesUrlGlob } from './url-glob.js';

export const AuthHeaderSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

export const AuthProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  urlPattern: z.string().min(1),
  headers: z.array(AuthHeaderSchema),
});

export const AuthProfileListSchema = z.array(AuthProfileSchema);

export type AuthHeader = z.infer<typeof AuthHeaderSchema>;
export type AuthProfile = z.infer<typeof AuthProfileSchema>;
export type AuthProfileList = z.infer<typeof AuthProfileListSchema>;

/**
 * Find the best-matching profile for a URL. Returns null if no profile's
 * `urlPattern` matches. If multiple profiles match, the one with the longest
 * pattern wins (most-specific). Ties broken by first-listed.
 */
export function matchProfile(
  profiles: AuthProfileList,
  url: string,
): AuthProfile | null {
  let best: AuthProfile | null = null;
  let bestLen = -1;
  for (const profile of profiles) {
    if (matchesUrlGlob(profile.urlPattern, url)) {
      if (profile.urlPattern.length > bestLen) {
        best = profile;
        bestLen = profile.urlPattern.length;
      }
    }
  }
  return best;
}

/**
 * Resolve a profile's header templates against a recording's `runAs` value.
 * Substitutes `${runAs}` (case-insensitive) with the user identity. Other
 * placeholder syntaxes (e.g. `${env.NAME}`) are reserved for later and left
 * untouched in v1.3.
 *
 * Returns the resolved headers as a flat record ready to feed
 * `context.setExtraHTTPHeaders` in the rendered spec.
 */
export function resolveProfileHeaders(
  profile: AuthProfile,
  runAs: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of profile.headers) {
    out[header.name] = header.value.replace(/\$\{runAs\}/gi, runAs);
  }
  return out;
}
