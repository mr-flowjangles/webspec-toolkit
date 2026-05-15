/**
 * Slug derivation for test-library folder names (v1.2 — `docs/08-test-library.md`).
 *
 * The extension's Save action turns a recording name into a path-safe folder
 * name under `~/Downloads/webspec/<slug>/`. Stable and deterministic so the
 * same name always maps to the same slug, regardless of which surface called.
 *
 * Rules:
 *   - Lowercase
 *   - Non-alphanumeric (run of any chars outside [a-z0-9]) → single `-`
 *   - Collapse consecutive `-`
 *   - Trim leading / trailing `-`
 *   - Max length 64 chars
 *
 * Browser-safe (pure string ops, no platform deps).
 */

const MAX_SLUG_LENGTH = 64;

export function deriveSlug(name: string): string {
  if (typeof name !== 'string') return '';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  // Trim to length, then re-trim a trailing dash that may have appeared at
  // the truncation boundary (e.g. "abc-def-ghi" truncated to "abc-def-" → "abc-def").
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
}
