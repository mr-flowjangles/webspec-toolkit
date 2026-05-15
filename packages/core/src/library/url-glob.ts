/**
 * URL glob matcher for v1.3 auth profiles.
 *
 * Single wildcard: `*` matches zero or more characters of any kind. No `?`,
 * no `**`, no character classes — keeps the mental model trivial. Patterns
 * are anchored implicitly: a pattern matches only when it covers the entire
 * URL. Internally translated to a regex.
 *
 * Examples:
 *   "http://app.ucm-dev.cmscloud.local/*"  → matches any URL on that host
 *   "https://*.example.com/admin/*"        → matches any subdomain's admin pages
 *   "http://localhost:4200/*"              → matches a local dev server
 *
 * Browser-safe (pure string ops).
 */

const REGEX_META = /[\\^$.+?()[\]{}|]/g;

export function matchesUrlGlob(pattern: string, url: string): boolean {
  if (typeof pattern !== 'string' || typeof url !== 'string') return false;
  if (pattern === '') return false;
  // Escape all regex metachars except `*`, then turn `*` into `.*` and anchor.
  const regexSrc = '^' + pattern.replace(REGEX_META, '\\$&').replace(/\*/g, '.*') + '$';
  try {
    return new RegExp(regexSrc).test(url);
  } catch {
    return false;
  }
}
