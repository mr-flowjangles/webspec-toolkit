// @vitest-environment happy-dom

/**
 * Tests for the recorder's hardened-selector synthesis.
 *
 * Uses happy-dom because the logic operates on real DOM elements (querying
 * attributes, walking `labels`, computing accessible names per the W3C
 * subset we implement). Pure-Node tests would require shimming half the
 * DOM API, which is more work than it's worth.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBasicSelector,
  buildHardenedSelector,
} from '../src/content-script/selectors.js';

function html(markup: string): Element {
  document.body.innerHTML = markup;
  const first = document.body.firstElementChild;
  if (first === null) throw new Error('html() expects markup with at least one root element');
  return first;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildHardenedSelector — priority order', () => {
  it('prefers data-testid over everything else', () => {
    const el = html(
      '<button data-testid="submit-btn" aria-label="Submit form">Send</button>',
    );
    const sel = buildHardenedSelector(el);
    expect(sel.strategy).toBe('testId');
    expect(sel.preferred).toBe('[data-testid="submit-btn"]');
    // Both the role fallback (button + "Submit form" via aria-label) and a
    // text fallback should be available downstream.
    expect(sel.fallbacks).toContain('role=button[name="Submit form"]');
    expect(sel.fallbacks).toContain('text="Send"');
  });

  it('accepts other test-id attribute variants', () => {
    expect(buildHardenedSelector(html('<button data-test-id="x">x</button>')).preferred).toBe(
      '[data-test-id="x"]',
    );
    expect(buildHardenedSelector(html('<button data-cy="y">y</button>')).preferred).toBe(
      '[data-cy="y"]',
    );
    expect(buildHardenedSelector(html('<button data-qa="z">z</button>')).preferred).toBe(
      '[data-qa="z"]',
    );
  });

  it('falls through to role+name when no test-id is present', () => {
    const el = html('<button>Save changes</button>');
    const sel = buildHardenedSelector(el);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toBe('role=button[name="Save changes"]');
    // CSS fallback is always last; text is a redundant duplicate of the name
    // in this case but is included for renderer flexibility.
    expect(sel.fallbacks).toContain('text="Save changes"');
    expect(sel.fallbacks[sel.fallbacks.length - 1]).toBe('button');
  });

  it('falls through to text when role is computable but name is missing', () => {
    // <article> has implicit role 'article' but no accessible-name-from-content
    // and no aria-label — so the role strategy can't satisfy, but the text
    // strategy can.
    const el = html('<article>Breaking news</article>');
    const sel = buildHardenedSelector(el);
    expect(sel.strategy).toBe('text');
    expect(sel.preferred).toBe('text="Breaking news"');
  });

  it('falls through to css when nothing else is computable', () => {
    // <div> has no implicit role, no test-id, and no text content.
    const el = html('<div class="empty"></div>');
    const sel = buildHardenedSelector(el);
    expect(sel.strategy).toBe('css');
    expect(sel.preferred).toBe('div.empty');
    expect(sel.fallbacks).toEqual([]);
  });
});

describe('buildHardenedSelector — accessible name sources', () => {
  it('uses aria-label when present', () => {
    const el = html('<button aria-label="Close dialog">×</button>');
    expect(buildHardenedSelector(el).preferred).toBe('role=button[name="Close dialog"]');
  });

  it('resolves aria-labelledby to referenced elements', () => {
    document.body.innerHTML = `
      <span id="lbl1">Choose</span>
      <span id="lbl2">size</span>
      <select aria-labelledby="lbl1 lbl2"></select>
    `;
    const select = document.querySelector('select')!;
    const sel = buildHardenedSelector(select);
    expect(sel.preferred).toBe('role=combobox[name="Choose size"]');
  });

  it('uses an associated <label for> for form controls', () => {
    document.body.innerHTML = `
      <label for="email">Email address</label>
      <input id="email" type="email" />
    `;
    const input = document.querySelector('input')!;
    expect(buildHardenedSelector(input).preferred).toBe('role=textbox[name="Email address"]');
  });

  it('uses a wrapping <label> as the name', () => {
    document.body.innerHTML = '<label>Username<input type="text" /></label>';
    const input = document.querySelector('input')!;
    expect(buildHardenedSelector(input).preferred).toBe('role=textbox[name="Username"]');
  });

  it('falls back to placeholder for unlabelled inputs', () => {
    const el = html('<input type="text" placeholder="What needs to be done?" />');
    expect(buildHardenedSelector(el).preferred).toBe(
      'role=textbox[name="What needs to be done?"]',
    );
  });

  it('uses textContent as the name for links', () => {
    const el = html('<a href="/foo">Documentation</a>');
    expect(buildHardenedSelector(el).preferred).toBe('role=link[name="Documentation"]');
  });
});

describe('buildHardenedSelector — implicit roles', () => {
  it('maps <input type="checkbox"> to checkbox', () => {
    document.body.innerHTML = '<label>Subscribe<input type="checkbox" /></label>';
    const input = document.querySelector('input')!;
    expect(buildHardenedSelector(input).preferred).toBe('role=checkbox[name="Subscribe"]');
  });

  it('maps <input type="radio"> to radio', () => {
    document.body.innerHTML = '<label>Yes<input type="radio" /></label>';
    const input = document.querySelector('input')!;
    expect(buildHardenedSelector(input).preferred).toBe('role=radio[name="Yes"]');
  });

  it('maps <a> without href to text (no implicit link role)', () => {
    const el = html('<a>Just a span really</a>');
    const sel = buildHardenedSelector(el);
    // No role → falls to text strategy.
    expect(sel.strategy).toBe('text');
    expect(sel.preferred).toBe('text="Just a span really"');
  });

  it('honors an explicit role attribute over the implicit one', () => {
    const el = html('<div role="alert" aria-label="Error">!</div>');
    expect(buildHardenedSelector(el).preferred).toBe('role=alert[name="Error"]');
  });
});

describe('buildHardenedSelector — text normalization', () => {
  it('collapses internal whitespace in accessible names and text', () => {
    const el = html(`<button>  Save\n  changes  </button>`);
    expect(buildHardenedSelector(el).preferred).toBe('role=button[name="Save\n  changes"]');
  });

  it('truncates very long names', () => {
    const longText = 'A'.repeat(200);
    const el = html(`<button>${longText}</button>`);
    const sel = buildHardenedSelector(el);
    // We truncate at 80 chars; the assertion stays robust by checking length.
    const match = /name="([^"]+)"/.exec(sel.preferred);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(80);
  });

  it('escapes embedded quotes in names', () => {
    const el = html(`<button aria-label='Say "hi"'>hi</button>`);
    expect(buildHardenedSelector(el).preferred).toBe('role=button[name="Say \\"hi\\""]');
  });
});

describe('buildHardenedSelector — interactive-ancestor promotion (v1.3.0)', () => {
  // Helper: render markup and return a deep descendant by selector.
  function deep(markup: string, querySelector: string): Element {
    document.body.innerHTML = markup;
    const found = document.body.querySelector(querySelector);
    if (found === null) throw new Error(`deep(): no element matches ${querySelector}`);
    return found;
  }

  it('promotes a click on a decorative <mat-icon> up to its enclosing menu item', () => {
    // Recreates the UCM "Lead (CSE)" case: click lands on a deep icon /
    // decorative element inside a [role=menuitem]. Pre-v1.3, hardening
    // emitted a positional css selector against the icon; now it promotes
    // up and uses the menu item's role + accessible name.
    const target = deep(
      `<div role="menuitem" aria-label="Lead (CSE)">
         <span><mat-icon>data_object</mat-icon></span>
         <span>Lead (CSE)</span>
       </div>`,
      'mat-icon',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toContain('role=menuitem');
    expect(sel.preferred).toContain('Lead (CSE)');
  });

  it('promotes a click on a span inside a <button> up to the button', () => {
    const target = deep(
      '<button aria-label="Save changes"><span class="ripple"></span><span>Save</span></button>',
      'span.ripple',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toContain('role=button');
    expect(sel.preferred).toContain('Save changes');
  });

  it('does not over-promote when the click target is already interactive', () => {
    // The <input> is interactive in its own right — we MUST NOT walk up to
    // the form, or we'd start emitting form-scoped selectors that don't
    // describe the user's actual click target.
    const target = deep(
      '<form><input type="text" aria-label="Email" /></form>',
      'input',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toBe('role=textbox[name="Email"]');
  });

  it('promotes through multiple decorative wrappers (up to depth 5)', () => {
    const target = deep(
      `<button aria-label="Open">
         <div><div><div><div><span class="x"></span></div></div></div></div>
       </button>`,
      'span.x',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toBe('role=button[name="Open"]');
  });

  it('stops walking past depth 5 — falls back to the original target when the interactive ancestor is too far', () => {
    // Six wrappers between span and button → exceeds the cap; the original
    // span has no useful selector, so we land on the css fallback.
    const target = deep(
      `<button aria-label="Buried">
         <div><div><div><div><div><div><span class="x"></span></div></div></div></div></div></div>
       </button>`,
      'span.x',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('css');
    expect(sel.preferred).toBe('span.x');
  });

  it('falls back to the original element when no interactive ancestor exists', () => {
    const target = deep(
      '<div class="card"><span class="label">hi</span></div>',
      'span.label',
    );
    const sel = buildHardenedSelector(target);
    // Text strategy on the span itself — pre-existing behavior, undisturbed.
    expect(sel.strategy).toBe('text');
    expect(sel.preferred).toBe('text="hi"');
  });

  it('skips <a> without href (not interactive per ARIA)', () => {
    const target = deep(
      '<a class="anchor-no-href"><button aria-label="Real button"><span class="x"></span></button></a>',
      'span.x',
    );
    const sel = buildHardenedSelector(target);
    // Walks past the <a> (no href) and lands on <button>.
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toBe('role=button[name="Real button"]');
  });

  it('promotes to a [role=tab] ancestor', () => {
    const target = deep(
      `<div role="tablist">
         <div role="tab" aria-label="Settings">
           <span class="tab-icon"></span>
         </div>
       </div>`,
      'span.tab-icon',
    );
    const sel = buildHardenedSelector(target);
    expect(sel.strategy).toBe('role');
    expect(sel.preferred).toBe('role=tab[name="Settings"]');
  });
});

describe('buildBasicSelector — used as the css fallback', () => {
  it('emits tag#id.class form when id and class are stable', () => {
    const el = html('<input id="search" class="search-box primary" />');
    expect(buildBasicSelector(el)).toBe('input#search.search-box.primary');
  });

  it('drops generated-looking classes', () => {
    const el = html('<div class="card css-x1y2z3 _abc1234"></div>');
    expect(buildBasicSelector(el)).toBe('div.card');
  });

  it('drops generated-looking ids', () => {
    const el = html('<button id="button-7f3a9d2e1c">Go</button>');
    expect(buildBasicSelector(el)).toBe('button');
  });
});
