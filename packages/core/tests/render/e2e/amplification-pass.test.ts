/**
 * End-to-end golden for the M6 amplification pass.
 *
 * Composes both halves: a hand-written `WorkflowRecording` is fed to
 * `AmplifyAnalyzer` with a fake `LLMProvider` that returns a canned
 * `AmplifiedRecording` (standing in for what the LLM would produce); the
 * result is rendered to Playwright source and snapshotted. This pins the
 * composition — analyzer + renderer wired together — independently of the
 * per-half goldens in `analyzer.test.ts` and `amplified.test.ts`.
 *
 * No LLM in the loop. Live Bedrock verification is gated on AWS access and
 * lives outside this suite.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AmplifyAnalyzer,
  renderAmplifiedPlaywrightSpec,
  type AmplifiedRecording,
  type HardenedSelector,
  type LLMProvider,
  type WorkflowRecording,
} from '../../../src/index.js';

function role(roleName: string, name: string): HardenedSelector {
  return { preferred: `role=${roleName}[name="${name}"]`, strategy: 'role', fallbacks: [] };
}

function fakeProvider(response: AmplifiedRecording): LLMProvider {
  return {
    complete: vi.fn(async () => response),
  } as unknown as LLMProvider;
}

const recording: WorkflowRecording = {
  startedAt: '2026-05-13T00:00:00.000Z',
  endedAt: '2026-05-13T00:00:10.000Z',
  startUrl: 'https://x.test/login',
  events: [
    { t: 100, kind: 'input', selector: role('textbox', 'Email'), value: 'user@example.com', sensitive: false },
    { t: 200, kind: 'input', selector: role('textbox', 'Password'), value: 'hunter2', sensitive: true },
    { t: 300, kind: 'click', selector: role('button', 'Sign in') },
  ],
  network: [],
  framework: 'playwright',
};

// What a well-behaved LLM would plausibly return for the recording above:
// the recorded happy path plus one negative variant.
const cannedLlmResponse: AmplifiedRecording = {
  scenarios: [
    {
      kind: 'happy',
      name: 'logs in with valid credentials',
      description: 'Recorded happy path: email, password, click Sign in.',
      actions: [
        { kind: 'goto', url: 'https://x.test/login' },
        { kind: 'fill', selector: role('textbox', 'Email'), value: 'user@example.com' },
        { kind: 'fill', selector: role('textbox', 'Password'), value: 'hunter2' },
        { kind: 'click', selector: role('button', 'Sign in') },
      ],
      assertions: [{ kind: 'visible', selector: role('heading', 'Welcome back') }],
    },
    {
      kind: 'negative',
      name: 'rejects empty password',
      description: 'Submit with email but no password — expect a validation error.',
      actions: [
        { kind: 'goto', url: 'https://x.test/login' },
        { kind: 'fill', selector: role('textbox', 'Email'), value: 'user@example.com' },
        { kind: 'click', selector: role('button', 'Sign in') },
      ],
      assertions: [{ kind: 'text', selector: role('alert', 'error'), mode: 'contains', value: 'required' }],
    },
  ],
};

describe('M6 amplification pass — end-to-end golden', () => {
  it('renders the LLM response into a Playwright spec', async () => {
    const llm = fakeProvider(cannedLlmResponse);
    const analyzer = new AmplifyAnalyzer(llm);

    const amplified = await analyzer.amplify(recording);
    const spec = renderAmplifiedPlaywrightSpec(amplified);

    expect(spec).toMatchInlineSnapshot(`
      "import { expect, test } from '@playwright/test';

      // Recorded happy path: email, password, click Sign in.
      test('logs in with valid credentials', async ({ page }) => {
        await page.goto('https://x.test/login');
        await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
        await page.getByRole('textbox', { name: 'Password' }).fill('hunter2');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      });

      // Submit with email but no password — expect a validation error.
      test('rejects empty password', async ({ page }) => {
        await page.goto('https://x.test/login');
        await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByRole('alert', { name: 'error' })).toContainText('required');
      });
      "
    `);
  });

  it('passes the recording through to the LLM unchanged', async () => {
    const llm = fakeProvider(cannedLlmResponse);
    const analyzer = new AmplifyAnalyzer(llm);

    await analyzer.amplify(recording);

    expect(llm.complete).toHaveBeenCalledTimes(1);
    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.messages[0].content).toContain('user@example.com');
    expect(call.messages[0].content).toContain('Sign in');
    expect(call.messages[0].content).toContain('https://x.test/login');
  });
});
