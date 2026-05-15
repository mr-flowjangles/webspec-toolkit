/**
 * Pre-start naming form — captures the test case name and description before
 * the recorder is armed. Both fields are required: the renderer uses `name`
 * as the `test()` title and emits `description` as a comment in the spec
 * (also surfaced in downstream test reports). Submit is disabled until both
 * fields have non-whitespace content.
 */
import { useId, type FormEvent } from 'react';

interface Props {
  name: string;
  description: string;
  onChange: (name: string, description: string) => void;
  onStart: (name: string, description: string) => void;
}

export function NamingForm({ name, description, onChange, onStart }: Props): JSX.Element {
  const nameId = useId();
  const descId = useId();
  const canStart = name.trim().length > 0 && description.trim().length > 0;

  function handleSubmit(ev: FormEvent): void {
    ev.preventDefault();
    if (!canStart) return;
    onStart(name.trim(), description.trim());
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
          onChange={(e) => onChange(e.target.value, description)}
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
          onChange={(e) => onChange(name, e.target.value)}
          placeholder="What does this test prove? Used in the rendered spec and the test report."
        />
      </label>

      <button type="submit" disabled={!canStart} className="naming-start-btn">
        Start recording
      </button>
    </form>
  );
}
