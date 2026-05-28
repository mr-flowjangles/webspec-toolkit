/**
 * Post-stop review panel (v0.5.4 → v1.2.0 rename).
 *
 * Replaces the auto-download-after-stop flow: when the user clicks Stop,
 * the popup renders this panel so they can see what they captured and
 * either Save (writes to ~/Downloads/webspec/<slug>/ — the v1.2 library
 * layout) or Discard. The recording is held in popup state until one of
 * those buttons is pressed.
 */
import type { WorkflowRecording } from '@webspec/core/browser';
import { formatDuration, summarizeRecording, type RecordingSummary, type UrlTrailEntry } from './summary.js';

interface Props {
  recording: WorkflowRecording;
  onSave: () => void;
  onDiscard: () => void;
}

export function RecordingSummaryPanel({ recording, onSave, onDiscard }: Props): JSX.Element {
  const summary = summarizeRecording(recording);

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

      <div className="trace-actions">
        <button
          type="button"
          className="trace-download-btn"
          onClick={onSave}
          disabled={summary.eventCount === 0}
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
