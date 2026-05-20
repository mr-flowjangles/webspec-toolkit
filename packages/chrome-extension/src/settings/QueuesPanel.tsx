/**
 * v1.4 Queues panel — compose Test Cases into ordered Queues.
 *
 * A Queue is an ordered list of saved Test Cases with a per-step `runAs` and
 * optional `iterations`. The manifest writes to
 * `<repo>/tests/queue-<n>-<slug>.json` in the user's configured Test repo
 * folder. The rendered `.spec.ts` is the renderer's concern (v1.4.1) — this
 * panel is the authoring surface only.
 *
 * Without a configured repo folder, the panel surfaces an empty state pointing
 * the user at Settings → General. Without saved Test Cases, it points the user
 * at the popup recorder. See `docs/10-team-shareability.md`.
 */
import { useEffect, useState } from 'react';
import { deriveSlug, type Queue, type QueueInput, type QueueStep } from '@webspec/core/browser';
import {
  checkRepoPermission,
  loadRepoFolderHandle,
  requestRepoPermission,
} from '../shared/repoFolder.js';
import {
  listQueues,
  listTestCases,
  nextQueuePosition,
  saveQueueWithSpec,
  type StoredQueue,
  type TestCaseSummary,
} from '../shared/queues.js';
import { loadProfiles } from '../shared/profiles.js';
import { ensureBootstrap } from '../shared/bootstrap.js';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-repo' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      folderName: string;
      testCases: TestCaseSummary[];
      queues: StoredQueue[];
    };

type SaveStatus = 'idle' | 'saving' | 'saved' | { error: string };

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; position: number; original: Queue };

export function QueuesPanel(): JSX.Element {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' });
  const [status, setStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(): Promise<void> {
    setLoad({ kind: 'loading' });
    const handle = await loadRepoFolderHandle();
    if (handle === null) {
      setLoad({ kind: 'no-repo' });
      return;
    }
    const perm = await checkRepoPermission(handle);
    if (perm !== 'granted') {
      setLoad({ kind: 'denied' });
      return;
    }
    try {
      const [testCases, queues] = await Promise.all([
        listTestCases(handle),
        listQueues(handle),
      ]);
      setLoad({ kind: 'ready', folderName: handle.name, testCases, queues });
    } catch (err) {
      setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function regrant(): Promise<void> {
    const handle = await loadRepoFolderHandle();
    if (handle === null) {
      setLoad({ kind: 'no-repo' });
      return;
    }
    const perm = await requestRepoPermission(handle);
    if (perm === 'granted') void refresh();
    else setLoad({ kind: 'denied' });
  }

  async function persist(queue: Queue, position: number): Promise<void> {
    setStatus('saving');
    const handle = await loadRepoFolderHandle();
    if (handle === null) {
      setStatus({ error: 'Test repo folder is no longer configured.' });
      return;
    }
    const perm = await checkRepoPermission(handle);
    if (perm !== 'granted') {
      setStatus({ error: 'Repo access has been revoked. Re-grant in Settings → General.' });
      return;
    }
    try {
      // v1.4.2: on first save into a fresh repo, scaffold package.json +
      // playwright.config.ts + .gitignore + README.md so teammates can run
      // the queue spec we're about to write. Confirmed-then-written; no-op
      // when package.json already exists.
      await ensureBootstrap(handle, {
        confirm: async () =>
          confirm(
            `webspec wants to scaffold a Playwright project in "${handle.name}" so your team can run the tests.\n\n` +
              `It will create: package.json, playwright.config.ts, .gitignore, README.md.\n\n` +
              `Continue?`,
          ),
      });
      const authProfiles = await loadProfiles();
      await saveQueueWithSpec(handle, position, queue, authProfiles);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
      setEditor({ kind: 'closed' });
      void refresh();
    } catch (err) {
      setStatus({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="queues-heading">
      <p id="queues-heading" className="settings-tagline">
        Compose Test Cases into ordered <strong>Queues</strong>. Each step picks a Test Case and a{' '}
        <code>runAs</code> value. Save writes both a <code>queue-N-&lt;slug&gt;.json</code> manifest
        and a runnable <code>queue-N-&lt;slug&gt;.spec.ts</code> to{' '}
        <code>&lt;repo&gt;/tests/</code> for your team to commit and run.
      </p>

      {load.kind === 'loading' && <p className="settings-empty">Loading…</p>}

      {load.kind === 'no-repo' && (
        <div className="settings-empty">
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No Test repo folder configured.</p>
          <p style={{ margin: 0 }}>
            Set one under <strong>Settings → General</strong> before composing a Queue.
          </p>
        </div>
      )}

      {load.kind === 'denied' && (
        <div className="settings-empty">
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Repo access pending.</p>
          <p style={{ margin: '0 0 12px' }}>
            Chrome needs your permission to read and write the Test repo folder.
          </p>
          <button type="button" className="settings-add-btn" onClick={() => void regrant()}>
            Re-grant access
          </button>
        </div>
      )}

      {load.kind === 'error' && (
        <p className="settings-status settings-status-err" role="alert">
          Failed to load Queues: {load.message}
        </p>
      )}

      {load.kind === 'ready' && (
        <ReadyView
          state={load}
          editor={editor}
          status={status}
          onNewQueue={() => setEditor({ kind: 'new' })}
          onEditQueue={(stored) =>
            setEditor({ kind: 'edit', position: stored.position, original: stored.queue })
          }
          onCancelEditor={() => {
            setEditor({ kind: 'closed' });
            setStatus('idle');
          }}
          onSave={(queue) => {
            const position =
              editor.kind === 'edit' ? editor.position : nextQueuePosition(load.queues);
            void persist(queue, position);
          }}
        />
      )}
    </section>
  );
}

interface ReadyViewProps {
  state: Extract<LoadState, { kind: 'ready' }>;
  editor: EditorMode;
  status: SaveStatus;
  onNewQueue: () => void;
  onEditQueue: (stored: StoredQueue) => void;
  onCancelEditor: () => void;
  onSave: (queue: Queue) => void;
}

function ReadyView({
  state,
  editor,
  status,
  onNewQueue,
  onEditQueue,
  onCancelEditor,
  onSave,
}: ReadyViewProps): JSX.Element {
  const noTestCases = state.testCases.length === 0;

  return (
    <>
      <div className="settings-actions">
        <button
          type="button"
          className="settings-add-btn"
          onClick={onNewQueue}
          disabled={noTestCases || editor.kind !== 'closed'}
        >
          + New Queue
        </button>
        <span className="settings-status">
          Repo: <code>{state.folderName}</code>
        </span>
        {status === 'saving' && <span className="settings-status">Saving…</span>}
        {status === 'saved' && <span className="settings-status settings-status-ok">Saved.</span>}
        {typeof status === 'object' && 'error' in status && (
          <span className="settings-status settings-status-err" role="alert">
            {status.error}
          </span>
        )}
      </div>

      {noTestCases && editor.kind === 'closed' && (
        <p className="settings-empty">
          No saved Test Cases under <code>{state.folderName}/test-cases/</code>. Record one from the
          extension popup first — then come back to compose a Queue.
        </p>
      )}

      {editor.kind !== 'closed' && (
        <QueueEditor
          testCases={state.testCases}
          initial={editor.kind === 'edit' ? editor.original : null}
          onSave={onSave}
          onCancel={onCancelEditor}
        />
      )}

      {state.queues.length === 0 ? (
        editor.kind === 'closed' && !noTestCases && (
          <p className="settings-empty">
            No Queues yet. Click <strong>+ New Queue</strong> to compose one.
          </p>
        )
      ) : (
        <ul className="queue-list" aria-label="Queues">
          {state.queues.map((stored) => (
            <li key={stored.position} className="queue-row">
              <QueueSummary
                stored={stored}
                onEdit={() => onEditQueue(stored)}
                disabled={editor.kind !== 'closed'}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function QueueSummary({
  stored,
  onEdit,
  disabled,
}: {
  stored: StoredQueue;
  onEdit: () => void;
  disabled: boolean;
}): JSX.Element {
  const { queue, position } = stored;
  return (
    <div className="profile-summary">
      <div className="profile-summary-main">
        <h2 className="profile-name">
          <span className="queue-position">#{position}</span> {queue.name}
        </h2>
        <code className="profile-url">tests/queue-{position}-{queue.slug}.json</code>
        <ul className="profile-headers">
          {queue.steps.map((step, idx) => (
            <li key={idx}>
              {idx + 1}. <code>{step.testCase}</code>
              {step.runAs && (
                <>
                  {' '}as <code>{step.runAs}</code>
                </>
              )}
              {step.iterations && step.iterations > 1 && (
                <>
                  {' '}× <code>{step.iterations}</code>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="profile-summary-actions">
        <button type="button" onClick={onEdit} disabled={disabled}>
          Edit
        </button>
      </div>
    </div>
  );
}

interface DraftStep {
  testCase: string;
  runAs: string;
  iterations: string;
}

interface DraftInput {
  name: string;
  value: string;
}

interface QueueEditorProps {
  testCases: TestCaseSummary[];
  initial: Queue | null;
  onSave: (queue: Queue) => void;
  onCancel: () => void;
}

function QueueEditor({ testCases, initial, onSave, onCancel }: QueueEditorProps): JSX.Element {
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [steps, setSteps] = useState<DraftStep[]>(
    initial !== null
      ? initial.steps.map((s) => ({
          testCase: s.testCase,
          runAs: s.runAs,
          iterations: s.iterations === undefined ? '' : String(s.iterations),
        }))
      : [{ testCase: testCases[0]?.slug ?? '', runAs: testCases[0]?.runAs ?? '', iterations: '' }],
  );
  const [inputs, setInputs] = useState<DraftInput[]>(
    initial?.inputs.map((i) => ({ name: i.name, value: i.value })) ?? [],
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function setStep(idx: number, patch: Partial<DraftStep>): void {
    setSteps((cur) => cur.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function pickTestCase(idx: number, slug: string): void {
    const summary = testCases.find((tc) => tc.slug === slug);
    setStep(idx, {
      testCase: slug,
      // Pre-fill `runAs` from the Test Case's recorded value if the row is
      // empty or matches the previously-selected Test Case's runAs.
      runAs: summary?.runAs ?? '',
    });
  }

  function addStep(): void {
    const first = testCases[0];
    setSteps((cur) => [
      ...cur,
      { testCase: first?.slug ?? '', runAs: first?.runAs ?? '', iterations: '' },
    ]);
  }

  function removeStep(idx: number): void {
    setSteps((cur) => cur.filter((_, i) => i !== idx));
  }

  function moveStep(idx: number, delta: -1 | 1): void {
    setSteps((cur) => {
      const target = idx + delta;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function addInput(): void {
    setInputs((cur) => [...cur, { name: '', value: '' }]);
  }
  function setInput(idx: number, patch: Partial<DraftInput>): void {
    setInputs((cur) => cur.map((i, j) => (j === idx ? { ...i, ...patch } : i)));
  }
  function removeInput(idx: number): void {
    setInputs((cur) => cur.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = name.trim();
    if (trimmedName === '') {
      setValidationError('Queue name is required.');
      return;
    }
    if (steps.length === 0) {
      setValidationError('A Queue needs at least one step.');
      return;
    }
    const builtSteps: QueueStep[] = [];
    for (const [i, s] of steps.entries()) {
      if (s.testCase.trim() === '') {
        setValidationError(`Step ${i + 1}: pick a Test Case.`);
        return;
      }
      let iterations: number | undefined;
      if (s.iterations.trim() !== '') {
        const n = Number(s.iterations);
        if (!Number.isInteger(n) || n < 1) {
          setValidationError(`Step ${i + 1}: iterations must be a positive integer.`);
          return;
        }
        if (n !== 1) iterations = n;
      }
      const step: QueueStep = { testCase: s.testCase, runAs: s.runAs };
      if (iterations !== undefined) step.iterations = iterations;
      builtSteps.push(step);
    }
    const builtInputs: QueueInput[] = [];
    for (const [i, inp] of inputs.entries()) {
      const trimmedKey = inp.name.trim();
      if (trimmedKey === '' && inp.value.trim() === '') continue;
      if (trimmedKey === '') {
        setValidationError(`Input ${i + 1}: name is required.`);
        return;
      }
      builtInputs.push({ name: trimmedKey, value: inp.value });
    }

    const queue: Queue = {
      schemaVersion: 1,
      id: initial?.id ?? crypto.randomUUID(),
      name: trimmedName,
      slug: initial?.slug ?? deriveSlug(trimmedName),
      steps: builtSteps,
      inputs: builtInputs,
    };
    onSave(queue);
  }

  return (
    <form className="profile-editor queue-editor" onSubmit={submit}>
      <label>
        Queue name
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Seed Leads"
          disabled={initial !== null}
        />
        {initial !== null && (
          <span className="profile-editor-hint">
            Slug is locked after first save — re-create the Queue to rename.
          </span>
        )}
      </label>

      <fieldset className="profile-headers-field">
        <legend>Steps</legend>
        {steps.map((step, idx) => (
          <div key={idx} className="queue-step-row">
            <span className="queue-step-num">{idx + 1}.</span>
            <select
              value={step.testCase}
              onChange={(e) => pickTestCase(idx, e.target.value)}
              aria-label={`Step ${idx + 1} Test Case`}
            >
              {testCases.map((tc) => (
                <option key={tc.slug} value={tc.slug}>
                  {tc.name} ({tc.slug})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={step.runAs}
              onChange={(e) => setStep(idx, { runAs: e.target.value })}
              placeholder="runAs"
              aria-label={`Step ${idx + 1} runAs`}
              className="queue-step-runas"
            />
            <input
              type="number"
              min={1}
              value={step.iterations}
              onChange={(e) => setStep(idx, { iterations: e.target.value })}
              placeholder="×1"
              aria-label={`Step ${idx + 1} iterations`}
              className="queue-step-iter"
            />
            <button
              type="button"
              onClick={() => moveStep(idx, -1)}
              disabled={idx === 0}
              aria-label={`Move step ${idx + 1} up`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveStep(idx, 1)}
              disabled={idx === steps.length - 1}
              aria-label={`Move step ${idx + 1} down`}
            >
              ↓
            </button>
            <button
              type="button"
              className="profile-header-remove"
              onClick={() => removeStep(idx)}
              aria-label={`Remove step ${idx + 1}`}
              disabled={steps.length === 1}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="profile-header-add" onClick={addStep}>
          + Add step
        </button>
      </fieldset>

      <fieldset className="profile-headers-field">
        <legend>Inputs (optional)</legend>
        <p className="profile-editor-hint">
          Flat key/value constants the Queue can reference (e.g. <code>record_id</code>).
        </p>
        {inputs.length === 0 ? (
          <p className="settings-empty" style={{ margin: '4px 0' }}>
            None.
          </p>
        ) : (
          inputs.map((inp, idx) => (
            <div key={idx} className="profile-header-row">
              <input
                type="text"
                value={inp.name}
                onChange={(e) => setInput(idx, { name: e.target.value })}
                placeholder="name"
                aria-label={`Input ${idx + 1} name`}
              />
              <input
                type="text"
                value={inp.value}
                onChange={(e) => setInput(idx, { value: e.target.value })}
                placeholder="value"
                aria-label={`Input ${idx + 1} value`}
              />
              <button
                type="button"
                className="profile-header-remove"
                onClick={() => removeInput(idx)}
                aria-label={`Remove input ${idx + 1}`}
              >
                ×
              </button>
            </div>
          ))
        )}
        <button type="button" className="profile-header-add" onClick={addInput}>
          + Add input
        </button>
      </fieldset>

      {validationError !== null && (
        <p className="settings-status settings-status-err" role="alert">
          {validationError}
        </p>
      )}

      <div className="profile-editor-actions">
        <button type="submit" className="profile-editor-save">
          Save Queue
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
