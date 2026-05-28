/**
 * Post-stop review panel (v0.5.4 → v1.2.0 rename).
 *
 * Replaces the auto-download-after-stop flow: when the user clicks Stop,
 * the popup renders this panel so they can see what they captured and
 * either Save (writes to ~/Downloads/webspec/<slug>/ — the v1.2 library
 * layout) or Discard. The recording is held in popup state until one of
 * those buttons is pressed.
 *
 * v1.6.2: embeds `IOAuthoringPanel` so the user can declare parametric
 * inputs (promoted from recorded fill values) and outputs (URL regex or
 * text selector). Authored arrays thread back to App via `onSave`.
 */
import { useState } from 'react';
import type {
  RecordingInput,
  RecordingOutput,
  WorkflowRecording,
} from '@webspec/core/browser';
import { IOAuthoringPanel } from './IOAuthoringPanel.js';
import type { IOValidationError } from './io-authoring.js';
import { proposeInputsFromRecording } from './io-proposal.js';
import { formatDuration, summarizeRecording, type RecordingSummary, type UrlTrailEntry } from './summary.js';

interface Props {
  recording: WorkflowRecording;
  onSave: (inputs: RecordingInput[], outputs: RecordingOutput[]) => void;
  onDiscard: () => void;
}

export function RecordingSummaryPanel({ recording, onSave, onDiscard }: Props): JSX.Element {
  const summary = summarizeRecording(recording);

  // v1.7.2 — auto-propose inputs from the recording on first review.
  // If the recording already carries `inputs` (rare in v1.7+, common for
  // recordings saved pre-v1.7.2 and re-opened), respect them as-is.
  // Otherwise, walk the events and seed the picker with promotable fills,
  // each with a name suggested from the selector. The user reviews,
  // unchecks unwanted ones, and edits names — no more authoring-from-empty.
  const [inputs, setInputs] = useState<RecordingInput[]>(
    recording.inputs !== undefined && recording.inputs.length > 0
      ? recording.inputs
      : proposeInputsFromRecording(recording),
  );
  const [outputs, setOutputs] = useState<RecordingOutput[]>(recording.outputs ?? []);
  const [validationErrors, setValidationErrors] = useState<IOValidationError[]>([]);

  const canSave = summary.eventCount > 0 && validationErrors.length === 0;

  return (
    <section className="trace-panel" aria-label="Recording summary">
      <header className="trace-panel-head">
        <h2>Recording summary</h2>
        <span className="trace-duration">{formatDuration(summary.durationMs)}</span>
      </header>

      <dl className="trace-stats">
        <dt>Events</dt>
        <dd>
          <strong>{summary.eventCount}</strong>
          {summary.eventCount > 0 && (
            <span className="trace-kinds"> {formatKindBreakdown(summary)}</span>
          )}
        </dd>
      </dl>

      <UrlTrailList trail={summary.urlTrail} />

      <p className="trace-warning" role="note">
        ⚠ Review before sharing — this recording contains the text you typed
        on the page.{' '}
        {summary.hasUserInput
          ? 'Passwords are masked; other inputs are not.'
          : 'No non-password user input was captured in this recording.'}
      </p>

      <IOAuthoringPanel
        recording={recording}
        inputs={inputs}
        outputs={outputs}
        onChange={(next) => {
          setInputs(next.inputs);
          setOutputs(next.outputs);
        }}
        onValidationChange={setValidationErrors}
      />

      <div className="trace-actions">
        <button
          type="button"
          className="trace-download-btn"
          onClick={() => onSave(inputs, outputs)}
          disabled={!canSave}
          title={
            validationErrors.length > 0
              ? `Fix ${validationErrors.length} validation error${validationErrors.length === 1 ? '' : 's'} before saving.`
              : undefined
          }
        >
          Save
        </button>
        <button
          type="button"
          className="trace-discard-btn"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </section>
  );
}

function formatKindBreakdown(summary: RecordingSummary): string {
  const order = ['input', 'click', 'keydown', 'change', 'submit', 'navigate'];
  const parts: string[] = [];
  for (const kind of order) {
    const count = summary.countsByKind[kind];
    if (count !== undefined && count > 0) parts.push(`${count} ${kind}`);
  }
  // Catch any kinds we didn't list explicitly (forward-compat with future
  // additions to RecordedEvent).
  for (const kind of Object.keys(summary.countsByKind)) {
    if (!order.includes(kind)) {
      parts.push(`${summary.countsByKind[kind]} ${kind}`);
    }
  }
  return parts.length === 0 ? '' : `· ${parts.join(' · ')}`;
}

function UrlTrailList({ trail }: { trail: UrlTrailEntry[] }): JSX.Element | null {
  if (trail.length === 0) return null;
  return (
    <details className="trace-urls" open={trail.length <= 4}>
      <summary>
        URL trail <span className="count">({trail.length})</span>
      </summary>
      <ol className="trace-url-list">
        {trail.map((entry, idx) => (
          <li key={`${idx}-${entry.url}`} className="trace-url-row">
            <span className="trace-url" title={entry.url}>
              {compactUrl(entry.url)}
            </span>
            {entry.reason !== 'start' && (
              <span className={`trace-url-reason trace-url-${entry.reason}`}>{entry.reason}</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * Trim a URL for display: drop the protocol, collapse long paths to fit
 * inside the popup's max-width. Hover title shows the full URL.
 */
function compactUrl(url: string): string {
  const trimmed = url.replace(/^https?:\/\//, '');
  if (trimmed.length <= 56) return trimmed;
  return trimmed.slice(0, 53) + '…';
}
