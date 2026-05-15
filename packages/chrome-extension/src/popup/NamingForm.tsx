/**
 * Pre-start naming form — captures the test case name, description, and an
 * optional run-as user identity before the recorder is armed. Name and
 * description are required: the renderer uses `name` as the `test()` title
 * and emits `description` as a comment in the spec. `runAs` is the user
 * identity for v1.3 auth injection — substituted into the matched profile's
 * `${runAs}` placeholders at save time. Empty `runAs` is fine — the rendered
 * spec just runs without auth (or with the literal `${runAs}` in headers if
 * a profile matched and the user left runAs blank).
 *
 * The matched auth profile is determined by the active tab URL at the moment
 * Record is clicked. It's displayed read-only in the form so the user knows
 * whether the resulting spec will be authenticated; if no profile matched,
 * the form shows a non-blocking hint that the test will run unauthenticated.
 *
 * Submit is disabled until name + description have non-whitespace content.
 */
import { useId, type FormEvent } from 'react';
import type { AuthProfile } from '@webspec/core/browser';

interface Props {
  name: string;
  description: string;
  runAs: string;
  matchedProfile: AuthProfile | null;
  onChange: (name: string, description: string, runAs: string) => void;
  onStart: (name: string, description: string, runAs: string) => void;
}

export function NamingForm({
  name,
  description,
  runAs,
  matchedProfile,
  onChange,
  onStart,
}: Props): JSX.Element {
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
          placeholder={
            matchedProfile
              ? 'Substituted into the matched profile\'s ${runAs} placeholders'
              : 'e.g. joe — used when an auth profile matches'
          }
        />
      </label>

      <div className="naming-form-auth-hint" role="status" aria-live="polite">
        {matchedProfile ? (
          <>
            <span className="naming-form-auth-ok">✓ Auth profile:</span>{' '}
            <strong>{matchedProfile.name}</strong>
          </>
        ) : (
          <span className="naming-form-auth-none">
            No auth profile matches this URL — spec will run unauthenticated.
          </span>
        )}
      </div>

      <button type="submit" disabled={!canStart} className="naming-start-btn">
        Start recording
      </button>
    </form>
  );
}
