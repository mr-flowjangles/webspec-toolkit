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

/**
 * Turn a slug into a valid JavaScript identifier suitable for an
 * `import { run as <id> } from '...'` alias in a generated Queue spec.
 *
 * Rules:
 *   - Split on dashes, camelCase the resulting words (`create-lead` → `createLead`).
 *   - If the first character would be a digit (slug started with a digit),
 *     prefix with `_` to keep the identifier valid.
 *   - Empty input returns `_` (fallback — shouldn't happen with derived slugs
 *     since `deriveSlug` strips empties, but defensive).
 *
 * Browser-safe (pure string ops). v1.5.0+.
 */
export function slugToIdentifier(slug: string): string {
  if (slug === '') return '_';
  const parts = slug.split('-').filter((p) => p !== '');
  if (parts.length === 0) return '_';
  const head = parts[0]!;
  const tail = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const id = head + tail.join('');
  return /^[0-9]/.test(id) ? `_${id}` : id;
}
