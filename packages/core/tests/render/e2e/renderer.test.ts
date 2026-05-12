/**
 * Golden tests for renderPlaywrightSpec — hand-written WorkflowRecording
 * fixtures → snapshot the emitted Playwright `.spec.ts` source. No LLM in
 * the loop; these tests pin the deterministic renderer (v0.7.0) independently
 * of the recorder.
 */
import { describe, it, expect } from 'vitest';
import { renderPlaywrightSpec } from '../../../src/index.js';
import type { HardenedSelector, RecordedEvent, WorkflowRecording } from '../../../src/index.js';

function roleSelector(role: string, name: string, nth?: number): HardenedSelector {
  const preferred = nth === undefined
    ? `role=${role}[name="${name}"]`
    : `role=${role}[name="${name}"] >> nth=${nth}`;
  return { preferred, strategy: 'role', fallbacks: [] };
}

function textSelector(text: string): HardenedSelector {
  return { preferred: `text="${text}"`, strategy: 'text', fallbacks: [] };
}

function testIdSelector(id: string): HardenedSelector {
  return { preferred: `[data-testid="${id}"]`, strategy: 'testId', fallbacks: [] };
}

function cssSelector(css: string): HardenedSelector {
  return { preferred: css, strategy: 'css', fallbacks: [] };
}

function recording(events: RecordedEvent[], startUrl = 'https://example.com'): WorkflowRecording {
  return {
    startedAt: '2026-05-12T00:00:00.000Z',
    endedAt: '2026-05-12T00:00:10.000Z',
    startUrl,
    events,
    network: [],
    framework: 'playwright',
  };
}

describe('renderPlaywrightSpec — header and scaffold', () => {
  const rendered = renderPlaywrightSpec(recording([]));

  it('imports test and expect from @playwright/test', () => {
    expect(rendered).toContain(`import { expect, test } from '@playwright/test';`);
  });

  it('opens a single test() block with the default name', () => {
    expect(rendered).toContain(`test('recorded workflow', async ({ page }) => {`);
  });

  it('emits goto(startUrl) as the first line of the test body', () => {
    expect(rendered).toContain(`await page.goto('https://example.com');`);
  });

  it('closes the test() block', () => {
    expect(rendered.trimEnd().endsWith('});')).toBe(true);
  });

  it('honors a custom test name', () => {
    const named = renderPlaywrightSpec(recording([]), { testName: 'login then logout' });
    expect(named).toContain(`test('login then logout', async ({ page }) => {`);
  });
});

describe('renderPlaywrightSpec — locator strategies', () => {
  it('role+name → getByRole', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 10, kind: 'click', selector: roleSelector('button', 'Save') }]),
    );
    expect(out).toContain(`await page.getByRole('button', { name: 'Save' }).click();`);
  });

  it('text → getByText', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 10, kind: 'click', selector: textSelector('Sign in') }]),
    );
    expect(out).toContain(`await page.getByText('Sign in').click();`);
  });

  it('testId → getByTestId', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 10, kind: 'click', selector: testIdSelector('submit-btn') }]),
    );
    expect(out).toContain(`await page.getByTestId('submit-btn').click();`);
  });

  it('css strategy → page.locator', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 10, kind: 'click', selector: cssSelector('button.primary') }]),
    );
    expect(out).toContain(`await page.locator('button.primary').click();`);
  });

  it('appends .nth(N) when the selector carries >> nth=N', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 10, kind: 'click', selector: roleSelector('checkbox', 'Toggle Todo', 1) }]),
    );
    expect(out).toContain(`await page.getByRole('checkbox', { name: 'Toggle Todo' }).nth(1).click();`);
  });
});

describe('renderPlaywrightSpec — actions', () => {
  it('input → fill', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'input',
          selector: roleSelector('textbox', 'What needs to be done?'),
          value: 'buy milk',
          sensitive: false,
        },
      ]),
    );
    expect(out).toContain(
      `await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('buy milk');`,
    );
  });

  it('keydown with selector → locator.press', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'keydown',
          key: 'Enter',
          selector: roleSelector('textbox', 'q'),
        },
      ]),
    );
    expect(out).toContain(`await page.getByRole('textbox', { name: 'q' }).press('Enter');`);
  });

  it('keydown without selector → keyboard.press', () => {
    const out = renderPlaywrightSpec(
      recording([{ t: 100, kind: 'keydown', key: 'Escape' }]),
    );
    expect(out).toContain(`await page.keyboard.press('Escape');`);
  });

  it('change on checkbox with value="true" → check', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'change',
          selector: roleSelector('checkbox', 'Subscribe'),
          value: 'true',
        },
      ]),
    );
    expect(out).toContain(`await page.getByRole('checkbox', { name: 'Subscribe' }).check();`);
  });

  it('change on checkbox with value="false" → uncheck', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'change',
          selector: roleSelector('checkbox', 'Subscribe'),
          value: 'false',
        },
      ]),
    );
    expect(out).toContain(`await page.getByRole('checkbox', { name: 'Subscribe' }).uncheck();`);
  });

  it('change on <select> (has options[]) → selectOption', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'change',
          selector: roleSelector('combobox', 'Country'),
          value: 'ca',
          options: [
            { value: 'us', label: 'United States' },
            { value: 'ca', label: 'Canada' },
          ],
        },
      ]),
    );
    expect(out).toContain(
      `await page.getByRole('combobox', { name: 'Country' }).selectOption('ca');`,
    );
  });

  it('submit → comment, no Playwright action', () => {
    const out = renderPlaywrightSpec(
      recording([
        { t: 100, kind: 'submit', selector: cssSelector('form#login') },
      ]),
    );
    expect(out).toContain(`// form submit observed on form#login`);
    expect(out).not.toMatch(/await page\.submit/);
  });
});

describe('renderPlaywrightSpec — navigation reasons', () => {
  it("reason 'reload' → page.reload()", () => {
    const out = renderPlaywrightSpec(
      recording([
        { t: 100, kind: 'navigate', url: 'https://example.com', reason: 'reload' },
      ]),
    );
    expect(out).toContain(`await page.reload();`);
  });

  it("reason 'navigate' → page.waitForURL(...)", () => {
    const out = renderPlaywrightSpec(
      recording([
        { t: 100, kind: 'navigate', url: 'https://example.com/next', reason: 'navigate' },
      ]),
    );
    expect(out).toContain(`await page.waitForURL('https://example.com/next');`);
  });

  it("reason 'history' → expect(page).toHaveURL(...)", () => {
    const out = renderPlaywrightSpec(
      recording([
        { t: 100, kind: 'navigate', url: 'https://example.com/#/active', reason: 'history' },
      ]),
    );
    expect(out).toContain(`await expect(page).toHaveURL('https://example.com/#/active');`);
  });

  it("reason 'hash' → expect(page).toHaveURL(...)", () => {
    const out = renderPlaywrightSpec(
      recording([
        { t: 100, kind: 'navigate', url: 'https://example.com/#/active', reason: 'hash' },
      ]),
    );
    expect(out).toContain(`await expect(page).toHaveURL('https://example.com/#/active');`);
  });
});

describe('renderPlaywrightSpec — string quoting', () => {
  it('falls back to JSON.stringify for values containing single quotes', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'input',
          selector: roleSelector('textbox', 'note'),
          value: "Tom's note",
          sensitive: false,
        },
      ]),
    );
    expect(out).toContain(`.fill("Tom's note");`);
  });

  it('falls back to JSON.stringify for values containing newlines', () => {
    const out = renderPlaywrightSpec(
      recording([
        {
          t: 100,
          kind: 'input',
          selector: roleSelector('textbox', 'body'),
          value: 'line one\nline two',
          sensitive: false,
        },
      ]),
    );
    expect(out).toContain(`.fill("line one\\nline two");`);
  });
});

describe('renderPlaywrightSpec — full TodoMVC fixture', () => {
  const out = renderPlaywrightSpec(
    recording(
      [
        {
          t: 1000,
          kind: 'input',
          selector: roleSelector('textbox', 'What needs to be done?'),
          value: 'buy milk',
          sensitive: false,
        },
        {
          t: 1100,
          kind: 'keydown',
          key: 'Enter',
          selector: roleSelector('textbox', 'What needs to be done?'),
        },
        {
          t: 2000,
          kind: 'change',
          selector: roleSelector('checkbox', 'Toggle Todo', 0),
          value: 'true',
        },
        {
          t: 3000,
          kind: 'click',
          selector: roleSelector('link', 'Active'),
        },
        {
          t: 3100,
          kind: 'navigate',
          url: 'https://demo.playwright.dev/todomvc/#/active',
          reason: 'hash',
        },
      ],
      'https://demo.playwright.dev/todomvc/',
    ),
  );

  it('emits an in-order sequence of awaited actions and assertions', () => {
    const idxGoto = out.indexOf("page.goto('https://demo.playwright.dev/todomvc/')");
    const idxFill = out.indexOf(".fill('buy milk')");
    const idxPress = out.indexOf(".press('Enter')");
    const idxCheck = out.indexOf("nth(0).check()");
    const idxLinkClick = out.indexOf("getByRole('link', { name: 'Active' }).click()");
    const idxAssertUrl = out.indexOf("expect(page).toHaveURL('https://demo.playwright.dev/todomvc/#/active')");
    expect(idxGoto).toBeGreaterThanOrEqual(0);
    expect(idxFill).toBeGreaterThan(idxGoto);
    expect(idxPress).toBeGreaterThan(idxFill);
    expect(idxCheck).toBeGreaterThan(idxPress);
    expect(idxLinkClick).toBeGreaterThan(idxCheck);
    expect(idxAssertUrl).toBeGreaterThan(idxLinkClick);
  });
});
