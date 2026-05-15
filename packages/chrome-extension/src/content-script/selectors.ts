/**
 * Selector synthesis for the recorder.
 *
 * v0.5.1: hardened-selector strategy. Each captured event carries a
 * `HardenedSelector { preferred, strategy, fallbacks[] }` so replay survives
 * markup churn (class hashes, wrapper-div refactors, CSS-module renames).
 *
 * Priority order matches Playwright's own codegen recommendation:
 *   1. data-testid                            → strategy: 'testId'
 *   2. ARIA role + accessible name            → strategy: 'role'
 *   3. visible text                           → strategy: 'text'
 *   4. basic CSS (tag#id.class)               → strategy: 'css'  (last resort)
 *
 * `preferred` is always a Playwright-compatible selector string so M6's
 * renderer can pass it straight to `page.locator(preferred)` if it wants
 * the literal form, or pattern-match the prefix (`role=`, `text=`) to emit
 * the higher-level `getByRole` / `getByText` calls.
 *
 * `fallbacks[]` lists weaker alternatives so the renderer (or a future
 * replay UI) can degrade gracefully if the preferred selector misses.
 *
 * Disambiguation: when the preferred selector matches more than one element
 * (e.g. TodoMVC has three checkboxes named "Toggle Todo"), we append a
 * Playwright `>> nth=N` suffix so each event uniquely identifies its target.
 * Skipped for the text strategy because text matches bubble through parents.
 */
import type { HardenedSelector } from '@webspec/core/browser';

/**
 * data-testid attribute variants we accept, in priority order. `data-testid`
 * is Playwright's default; the others cover the dominant alternatives in
 * Bellese codebases (React Testing Library, Cypress, etc.).
 */
const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];

/** Max length for text-based selectors so we don't bake huge strings into recordings. */
const MAX_TEXT_LENGTH = 80;

/**
 * Build a HardenedSelector for a single element. Always returns a result —
 * if nothing better is available, falls back to a basic CSS selector with
 * `strategy: 'css'`.
 *
 * v1.3.0 — interactive-ancestor promotion. Material-UI / Angular Material
 * components frequently render an interactive button or menu item with a
 * deep tree of decorative wrappers (mat-icon, ripple overlay, transparent
 * div). The user clicks on the visual chrome; `event.target` is the deepest
 * element, which has no role / aria-label / data-testid / textContent — so
 * the previous logic fell straight through to a positional CSS selector
 * like `div >> nth=369` that rotted the moment the DOM shifted. We now
 * walk up the tree first to find the nearest interactive ancestor and
 * harden against THAT element instead.
 */
export function buildHardenedSelector(el: Element): HardenedSelector {
  const target = findInteractiveTarget(el);
  const css = buildBasicSelector(target);

  // The disambiguation/role/text helpers below all operate on `target`. We
  // alias to preserve readability while keeping the promotion contained.
  el = target;

  // 1. data-testid family
  const testId = findTestId(el);
  if (testId !== null) {
    const fallbacks = collectFallbacks(el, ['testId'], css);
    return {
      preferred: disambiguateCss(el, testId.selector),
      strategy: 'testId',
      fallbacks,
    };
  }

  // 2. role + accessible name
  const role = computeRole(el);
  const name = role !== null ? computeAccessibleName(el) : null;
  if (role !== null && name !== null && name !== '') {
    const base = `role=${role}[name="${escapeQuotes(name)}"]`;
    const fallbacks = collectFallbacks(el, ['testId', 'role'], css);
    return {
      preferred: disambiguateRole(el, role, name, base),
      strategy: 'role',
      fallbacks,
    };
  }

  // 3. visible text — no nth disambiguation; text matches bubble through
  // ancestors, so appending nth would mis-target.
  const text = visibleText(el);
  if (text !== null && text !== '') {
    const fallbacks = collectFallbacks(el, ['testId', 'role', 'text'], css);
    return { preferred: `text="${escapeQuotes(text)}"`, strategy: 'text', fallbacks };
  }

  // 4. CSS fallback
  return { preferred: disambiguateCss(el, css), strategy: 'css', fallbacks: [] };
}

// ---------------------------------------------------------------------------
// Interactive-ancestor promotion (v1.3.0)
// ---------------------------------------------------------------------------

/**
 * ARIA roles that signal an interactive element worth promoting up to. If a
 * click lands on a decorative descendant of one of these, we'd rather emit
 * a selector for the role-bearing ancestor — its accessible name and text
 * are typically stable, while the decorative descendant has neither.
 */
const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'treeitem',
  'option',
  'checkbox',
  'radio',
  'switch',
  'combobox',
  'listbox',
]);

const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  'button',
  'a', // only when href is present — checked in isInteractive
  'input',
  'select',
  'textarea',
]);

/**
 * Cap on how far we walk up the DOM. Five levels covers the deepest
 * decorative wrapper trees commonly seen in Material UI / Angular Material;
 * going further risks promoting to a too-broad ancestor (a whole nav, a
 * page section) that wouldn't represent the user's actual click intent.
 */
const ANCESTOR_WALK_MAX_DEPTH = 5;

function isInteractive(el: Element): boolean {
  const role = el.getAttribute('role');
  if (role !== null && INTERACTIVE_ROLES.has(role)) return true;
  const tag = el.tagName.toLowerCase();
  if (!INTERACTIVE_TAGS.has(tag)) return false;
  // <a> without href is non-interactive (just a styled span). The recorder
  // shouldn't promote to it because Playwright's `getByRole('link')` would
  // skip it too.
  if (tag === 'a') return el.hasAttribute('href');
  return true;
}

/**
 * Walk up from `el` looking for the nearest interactive ancestor (button,
 * menu item, link, input, etc.). Returns `el` unchanged if it's already
 * interactive — we never promote past the user's actual target — and
 * returns `el` if no interactive ancestor is found within the walk cap,
 * preserving the legacy hardening behavior for those cases.
 */
function findInteractiveTarget(el: Element): Element {
  if (isInteractive(el)) return el;
  let current: Element | null = el.parentElement;
  let depth = 0;
  while (current !== null && depth < ANCESTOR_WALK_MAX_DEPTH) {
    if (isInteractive(current)) return current;
    current = current.parentElement;
    depth += 1;
  }
  return el;
}

// ---------------------------------------------------------------------------
// Disambiguation — append `>> nth=N` when a selector matches multiple elements
// ---------------------------------------------------------------------------

/**
 * If `selector` (a CSS-compatible string) matches multiple elements on the
 * page, append a Playwright `>> nth=N` suffix so it targets only `el`.
 */
function disambiguateCss(el: Element, selector: string): string {
  let matches: Element[];
  try {
    matches = Array.from(el.ownerDocument.querySelectorAll(selector));
  } catch {
    return selector; // invalid selector somehow — leave it alone
  }
  if (matches.length <= 1) return selector;
  const index = matches.indexOf(el);
  if (index < 0) return selector;
  return `${selector} >> nth=${index}`;
}

/**
 * Role-based disambiguation. Walk all elements, re-compute role+name for
 * each, and count those that match. If more than one matches, append the
 * positional `>> nth=N` suffix.
 *
 * Cost: one DOM walk per recorded event. TodoMVC-scale (~50 elements) is
 * trivial; on very large pages this could be slow. Acceptable for v0.5.1 —
 * recorder events are user-paced, not high-frequency.
 */
function disambiguateRole(el: Element, role: string, name: string, base: string): string {
  const candidates = el.ownerDocument.getElementsByTagName('*');
  const matches: Element[] = [];
  for (const candidate of Array.from(candidates)) {
    if (computeRole(candidate) === role && computeAccessibleName(candidate) === name) {
      matches.push(candidate);
    }
  }
  if (matches.length <= 1) return base;
  const index = matches.indexOf(el);
  if (index < 0) return base;
  return `${base} >> nth=${index}`;
}

/**
 * Basic CSS selector — `tag#id.class1.class2`. No uniqueness guarantees.
 * Kept as the css-strategy implementation and the universal fallback.
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

// ---------------------------------------------------------------------------
// data-testid
// ---------------------------------------------------------------------------

interface TestIdMatch {
  attribute: string;
  value: string;
  /** Playwright-compatible CSS selector form. */
  selector: string;
}

function findTestId(el: Element): TestIdMatch | null {
  for (const attr of TEST_ID_ATTRIBUTES) {
    const value = el.getAttribute(attr);
    if (value !== null && value !== '') {
      return { attribute: attr, value, selector: `[${attr}="${escapeQuotes(value)}"]` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ARIA role
// ---------------------------------------------------------------------------

/**
 * Implicit ARIA roles for common HTML elements. Subset chosen for what the
 * recorder actually sees (interactive elements). For more obscure mappings
 * we'd fall through to text or css — that's fine for v1.
 */
const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  a: 'link', // only when href is present — see computeRole
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  article: 'article',
  section: 'region',
  form: 'form',
};

const IMPLICIT_INPUT_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  // text/email/password/tel/url/number all map to textbox
  text: 'textbox',
  email: 'textbox',
  password: 'textbox',
  tel: 'textbox',
  url: 'textbox',
  number: 'textbox',
};

function computeRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit !== null && explicit !== '') return explicit;

  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return IMPLICIT_INPUT_ROLES[type] ?? 'textbox';
  }
  return IMPLICIT_ROLES[tag] ?? null;
}

// ---------------------------------------------------------------------------
// Accessible name (pragmatic subset of the W3C accname spec)
// ---------------------------------------------------------------------------

/**
 * Compute an accessible name for the element. Implements a *subset* of the
 * W3C Accessible Name spec — enough to handle the common cases that drive
 * recording quality:
 *
 *   - aria-labelledby points-to chain (joined textContent)
 *   - aria-label attribute
 *   - <label for> association for form controls (and wrapping <label>)
 *   - placeholder / title fallback for inputs
 *   - textContent for buttons/links
 *
 * The spec is much richer (alt on images inside buttons, fieldset/legend,
 * etc.) — we cover that in v2 if recording quality demands it.
 */
function computeAccessibleName(el: Element): string | null {
  // aria-labelledby — points at one or more element ids; join their text.
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null && labelledBy !== '') {
    const ownerDocument = el.ownerDocument;
    const names = labelledBy
      .split(/\s+/)
      .map((id) => ownerDocument?.getElementById(id)?.textContent?.trim())
      .filter((s): s is string => typeof s === 'string' && s !== '')
      .join(' ');
    if (names !== '') return truncate(names);
  }

  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim() !== '') return truncate(ariaLabel.trim());

  // Form-control labels — `<input>` and friends expose a `labels` HTMLCollection.
  // Also catches wrapping `<label>Foo<input/></label>` pattern.
  if (isLabelable(el)) {
    const labels = (el as HTMLInputElement).labels;
    if (labels !== null && labels.length > 0) {
      const text = Array.from(labels)
        .map((l) => l.textContent?.trim() ?? '')
        .filter((t) => t !== '')
        .join(' ');
      if (text !== '') return truncate(text);
    }
    // Placeholder is a weak but commonly-useful fallback for unlabelled inputs.
    const placeholder = el.getAttribute('placeholder');
    if (placeholder !== null && placeholder.trim() !== '') return truncate(placeholder.trim());
  }

  // Title attribute — last resort before falling through to textContent.
  const title = el.getAttribute('title');
  if (title !== null && title.trim() !== '') return truncate(title.trim());

  // Buttons and links: the visible text IS the accessible name (per spec).
  const role = el.getAttribute('role');
  const tag = el.tagName.toLowerCase();
  const isNameFromContent =
    role === 'button' || role === 'link' || tag === 'button' || tag === 'a';
  if (isNameFromContent) {
    const text = el.textContent?.trim() ?? '';
    if (text !== '') return truncate(text);
  }

  return null;
}

function isLabelable(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  // The HTML spec's "labelable elements" set, restricted to what we care
  // about for recording. <output> is technically labelable but rarely used.
  return tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button';
}

// ---------------------------------------------------------------------------
// Visible text
// ---------------------------------------------------------------------------

function visibleText(el: Element): string | null {
  const raw = el.textContent;
  if (raw === null) return null;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized === '') return null;
  return truncate(normalized);
}

// ---------------------------------------------------------------------------
// Fallback assembly
// ---------------------------------------------------------------------------

type Strategy = HardenedSelector['strategy'];

/**
 * Build the `fallbacks` array — weaker strategies that aren't already the
 * preferred one. Each call passes the list of strategies that came earlier
 * in the priority chain so we don't repeat them.
 */
function collectFallbacks(el: Element, alreadyTried: Strategy[], css: string): string[] {
  const tried = new Set<Strategy>(alreadyTried);
  const fallbacks: string[] = [];

  if (!tried.has('role')) {
    const role = computeRole(el);
    const name = role !== null ? computeAccessibleName(el) : null;
    if (role !== null && name !== null && name !== '') {
      fallbacks.push(`role=${role}[name="${escapeQuotes(name)}"]`);
    }
  }

  if (!tried.has('text')) {
    const text = visibleText(el);
    if (text !== null && text !== '') {
      fallbacks.push(`text="${escapeQuotes(text)}"`);
    }
  }

  if (!tried.has('css')) {
    fallbacks.push(css);
  }

  return fallbacks;
}

// ---------------------------------------------------------------------------
// Helpers shared with the basic-css strategy
// ---------------------------------------------------------------------------

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

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function truncate(value: string): string {
  return value.length <= MAX_TEXT_LENGTH ? value : value.slice(0, MAX_TEXT_LENGTH).trim();
}
