/**
 * Golden tests for renderAmplifiedPlaywrightSpec — hand-written
 * AmplifiedRecording fixtures → snapshot the emitted Playwright `.spec.ts`
 * source. No LLM in the loop; pins the deterministic IR renderer (v0.7.1)
 * independently of the amplifier (v0.7.2).
 */
import { describe, it, expect } from 'vitest';
import { renderAmplifiedPlaywrightSpec } from '../../../src/index.js';
import type {
  AmplifiedAction,
  AmplifiedAssertion,
  AmplifiedRecording,
  HardenedSelector,
} from '../../../src/index.js';

function roleSel(role: string, name: string): HardenedSelector {
  return { preferred: `role=${role}[name="${name}"]`, strategy: 'role', fallbacks: [] };
}

function amp(actions: AmplifiedAction[], assertions: AmplifiedAssertion[] = []): AmplifiedRecording {
  return {
    scenarios: [
      {
        kind: 'happy',
        name: 'recorded workflow',
        actions,
        assertions,
      },
    ],
  };
}

describe('renderAmplifiedPlaywrightSpec — scaffold', () => {
  it('imports expect and test', () => {
    const out = renderAmplifiedPlaywrightSpec(amp([{ kind: 'reload' }]));
    expect(out).toContain(`import { expect, test } from '@playwright/test';`);
  });

  it('emits one test() block per scenario', () => {
    const out = renderAmplifiedPlaywrightSpec({
      scenarios: [
        { kind: 'happy', name: 'a', actions: [{ kind: 'reload' }], assertions: [] },
        { kind: 'negative', name: 'b', actions: [{ kind: 'reload' }], assertions: [] },
      ],
    });
    const matches = out.match(/^test\(/gm);
    expect(matches?.length).toBe(2);
  });

  it('renders description as a comment above the test', () => {
    const out = renderAmplifiedPlaywrightSpec({
      scenarios: [
        {
          kind: 'happy',
          name: 'logs in',
          description: 'Verifies the happy path through the login form.',
          actions: [{ kind: 'reload' }],
          assertions: [],
        },
      ],
    });
    expect(out).toContain('// Verifies the happy path through the login form.');
  });

  it('omits the description comment when description is missing', () => {
    const out = renderAmplifiedPlaywrightSpec(amp([{ kind: 'reload' }]));
    expect(out).not.toContain('// ');
  });
});

describe('renderAmplifiedPlaywrightSpec — actions', () => {
  it('renders click', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp([{ kind: 'click', selector: roleSel('button', 'Save') }]),
    );
    expect(out).toContain(`await page.getByRole('button', { name: 'Save' }).click();`);
  });

  it('renders fill', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp([{ kind: 'fill', selector: roleSel('textbox', 'Email'), value: 'a@b.com' }]),
    );
    expect(out).toContain(`await page.getByRole('textbox', { name: 'Email' }).fill('a@b.com');`);
  });

  it('renders press', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp([{ kind: 'press', selector: roleSel('textbox', 'Email'), key: 'Tab' }]),
    );
    expect(out).toContain(`await page.getByRole('textbox', { name: 'Email' }).press('Tab');`);
  });

  it('renders goto / reload / waitForURL', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp([
        { kind: 'goto', url: 'https://x.test/' },
        { kind: 'reload' },
        { kind: 'waitForURL', url: 'https://x.test/done' },
      ]),
    );
    expect(out).toContain(`await page.goto('https://x.test/');`);
    expect(out).toContain(`await page.reload();`);
    expect(out).toContain(`await page.waitForURL('https://x.test/done');`);
  });

  it('renders selectOption / check / uncheck', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp([
        { kind: 'selectOption', selector: roleSel('combobox', 'Country'), value: 'ca' },
        { kind: 'check', selector: roleSel('checkbox', 'Subscribe') },
        { kind: 'uncheck', selector: roleSel('checkbox', 'Subscribe') },
      ]),
    );
    expect(out).toContain(`.selectOption('ca');`);
    expect(out).toContain(`.check();`);
    expect(out).toContain(`.uncheck();`);
  });
});

describe('renderAmplifiedPlaywrightSpec — assertions', () => {
  const sel = roleSel('heading', 'Welcome');

  it('renders visible / hidden', () => {
    const visible = renderAmplifiedPlaywrightSpec(amp([], [{ kind: 'visible', selector: sel }]));
    const hidden = renderAmplifiedPlaywrightSpec(amp([], [{ kind: 'hidden', selector: sel }]));
    expect(visible).toContain('.toBeVisible();');
    expect(hidden).toContain('.toBeHidden();');
  });

  it('renders text in equals and contains mode', () => {
    const equals = renderAmplifiedPlaywrightSpec(
      amp([], [{ kind: 'text', selector: sel, mode: 'equals', value: 'Welcome' }]),
    );
    const contains = renderAmplifiedPlaywrightSpec(
      amp([], [{ kind: 'text', selector: sel, mode: 'contains', value: 'Welco' }]),
    );
    expect(equals).toContain(`.toHaveText('Welcome');`);
    expect(contains).toContain(`.toContainText('Welco');`);
  });

  it('renders url, count, value, checked', () => {
    const out = renderAmplifiedPlaywrightSpec(
      amp(
        [],
        [
          { kind: 'url', value: 'https://x.test/home' },
          { kind: 'count', selector: roleSel('listitem', 'todo'), value: 3 },
          { kind: 'value', selector: roleSel('textbox', 'Email'), value: 'a@b.com' },
          { kind: 'checked', selector: roleSel('checkbox', 'Agree') },
        ],
      ),
    );
    expect(out).toContain(`await expect(page).toHaveURL('https://x.test/home');`);
    expect(out).toContain(`.toHaveCount(3);`);
    expect(out).toContain(`.toHaveValue('a@b.com');`);
    expect(out).toContain(`.toBeChecked();`);
  });
});

describe('renderAmplifiedPlaywrightSpec — happy + negative pair', () => {
  const fixture: AmplifiedRecording = {
    scenarios: [
      {
        kind: 'happy',
        name: 'logs in with valid credentials',
        description: 'Recorded happy path: email, password, click Sign in, land on /dashboard.',
        actions: [
          { kind: 'goto', url: 'https://x.test/login' },
          { kind: 'fill', selector: roleSel('textbox', 'Email'), value: 'user@example.com' },
          { kind: 'fill', selector: roleSel('textbox', 'Password'), value: 'hunter2' },
          { kind: 'click', selector: roleSel('button', 'Sign in') },
          { kind: 'waitForURL', url: 'https://x.test/dashboard' },
        ],
        assertions: [
          { kind: 'visible', selector: roleSel('heading', 'Welcome back') },
        ],
      },
      {
        kind: 'negative',
        name: 'rejects empty submission',
        description: 'Click Sign in with no fields filled.',
        actions: [
          { kind: 'goto', url: 'https://x.test/login' },
          { kind: 'click', selector: roleSel('button', 'Sign in') },
        ],
        assertions: [
          {
            kind: 'text',
            selector: roleSel('alert', 'error'),
            mode: 'contains',
            value: 'required',
          },
        ],
      },
    ],
  };

  const out = renderAmplifiedPlaywrightSpec(fixture);

  it('produces two test blocks with the right names and descriptions', () => {
    expect(out).toContain(`test('logs in with valid credentials'`);
    expect(out).toContain(`test('rejects empty submission'`);
    expect(out).toContain('// Recorded happy path: email, password, click Sign in, land on /dashboard.');
    expect(out).toContain('// Click Sign in with no fields filled.');
  });

  it('runs actions before assertions within a scenario', () => {
    const negativeBlock = out.slice(out.indexOf("test('rejects empty submission'"));
    const idxClick = negativeBlock.indexOf("getByRole('button', { name: 'Sign in' }).click()");
    const idxAssert = negativeBlock.indexOf('toContainText');
    expect(idxClick).toBeGreaterThanOrEqual(0);
    expect(idxAssert).toBeGreaterThan(idxClick);
  });

  it('does not interleave the two scenarios', () => {
    const idxFirstTest = out.indexOf("test('logs in with valid credentials'");
    const idxFirstClose = out.indexOf('});', idxFirstTest);
    const idxSecondTest = out.indexOf("test('rejects empty submission'");
    expect(idxFirstClose).toBeGreaterThan(idxFirstTest);
    expect(idxSecondTest).toBeGreaterThan(idxFirstClose);
  });
});
