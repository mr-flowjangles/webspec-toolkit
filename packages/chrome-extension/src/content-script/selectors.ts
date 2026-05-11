/**
 * Selector synthesis for the recorder.
 *
 * v0.4.1: basic CSS selector — `tag#id.class1.class2`. Good enough to validate
 * the recorder architecture and produce runnable (if brittle) Playwright specs.
 *
 * v0.4.3 will replace this with a hardened-selector strategy:
 *   data-testid > aria role + accessible name > visible text > css fallback.
 * That layer goes here too, behind a `buildHardenedSelector` API that returns
 * a typed `HardenedSelector` with `strategy` set per match.
 */

/**
 * Build a basic CSS selector for a single element. No uniqueness guarantees
 * within the document — that's what hardened selectors fix in v0.4.3.
 *
 * Strategy:
 *   1. tag name (always)
 *   2. `#id` if id is non-empty and looks stable (no generated suffixes)
 *   3. up to two short, hand-authored-looking classes
 *
 * Generated-looking classes (`css-x1y2z3`, `_abc123`, `jsx-1234567`, etc.)
 * are filtered out — they change between builds and ruin replay.
 */
export function buildBasicSelector(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];

  if (looksStable(el.id)) {
    parts.push(`#${cssEscape(el.id)}`);
  }

  const stableClasses = Array.from(el.classList)
    .filter(looksStable)
    .slice(0, 2)
    .map((c) => `.${cssEscape(c)}`);
  parts.push(...stableClasses);

  return parts.join('');
}

const GENERATED_CLASS_PATTERNS: readonly RegExp[] = [
  /^css-[a-z0-9]{4,}$/i, // emotion / styled-components
  /^_[a-z0-9]{4,}$/i, // css modules / parcel
  /^jsx-\d+$/i, // styled-jsx
  /^[a-z0-9]{6,}__[a-z0-9_-]+/i, // BEM-with-hash patterns
  /^[a-f0-9]{8,}$/i, // pure hash
  /-[a-z0-9]{6,}$/i, // trailing build hash
];

function looksStable(value: string): boolean {
  if (value === '') return false;
  if (value.startsWith(' ')) return false;
  return !GENERATED_CLASS_PATTERNS.some((re) => re.test(value));
}

/**
 * Minimal CSS.escape polyfill — content scripts run in real browsers so
 * `CSS.escape` is available, but use it defensively and fall back to the
 * naive replace for older Chromium quirks.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
