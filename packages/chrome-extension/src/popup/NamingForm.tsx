/**
 * Pre-start naming form — captures the test case name, description, and an
 * optional run-as user identity before the recorder is armed. Name and
 * description are required: the renderer uses `name` as the `test()` title
 * and emits `description` as a comment in the spec. `runAs` is captured
 * here but rendered later (v1.3 — see docs/08-test-library.md): once the
 * project ships a `webspec.config.ts`, the renderer emits an auth step
 * driven by `runAs`. Empty `runAs` is fine — the rendered spec just runs
 * unauthenticated. Submit is disabled until name + description have
 * non-whitespace content.
 */
import { useId, type FormEvent } from 'react';

interface Props {
  name: string;
  description: string;
  runAs: string;
  onChange: (name: string, description: string, runAs: string) => void;
  onStart: (name: string, description: string, runAs: string) => void;
}

export function NamingForm({ name, description, runAs, onChange, onStart }: Props): JSX.Element {
  const nameId = useId();
  const descId = useId();
  const runAsId = useId();
  const canStart = name.trim().length > 0 && description.trim().length > 0;

  function handleSubmit(ev: FormEvent): void {
    ev.preventDefault();
    if (!canStart) return;
    onStart(name.trim(), description.trim(), runAs.trim());
  }

  return (
    <form className="naming-form" onSubmit={handleSubmit} aria-label="Name this recording">
      <label htmlFor={nameId}>
        Test case name
        <input
          id={nameId}
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => onChange(e.target.value, description, runAs)}
          placeholder="e.g. Create lead — UCM NexGen"
        />
      </label>

      <label htmlFor={descId}>
        Description
        <textarea
          id={descId}
          required
          rows={3}
          value={description}
          onChange={(e) => onChange(name, e.target.value, runAs)}
          placeholder="What does this test prove? Used in the rendered spec and the test report."
        />
      </label>

      <label htmlFor={runAsId}>
        Run as user <span className="naming-form-optional">(optional)</span>
        <input
          id={runAsId}
          type="text"
          value={runAs}
          onChange={(e) => onChange(name, description, e.target.value)}
          placeholder="e.g. joe — used by the auth-injection step (v1.3)"
        />
      </label>

      <button type="submit" disabled={!canStart} className="naming-start-btn">
        Start recording
      </button>
    </form>
  );
}
