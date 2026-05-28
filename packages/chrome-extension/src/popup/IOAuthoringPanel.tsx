/**
 * v1.6.2 — Save-panel Inputs/Outputs authoring UI.
 *
 * Two collapsible sections embedded above the Save button:
 *   - Inputs: one row per fill/change event in the recording with a
 *             checkbox and a name field. Checking promotes the recorded
 *             value to a named parameter on the helper signature.
 *   - Outputs: a growable list of {name, source.kind, pattern|selector}.
 *
 * State is local — `RecordingSummaryPanel` reads it via the `onChange` and
 * `onValidationChange` callbacks and threads the authored arrays into the
 * save handler. Pure transforms + validation live in `io-authoring.ts`.
 */
import { useEffect, useMemo } from 'react';
import type {
  RecordingInput,
  RecordingOutput,
  RecordingOutputSource,
  WorkflowRecording,
} from '@webspec/core/browser';
import {
  extractFillEventRows,
  validateIOAuthoring,
  type IOValidationError,
} from './io-authoring.js';

interface Props {
  recording: WorkflowRecording;
  inputs: RecordingInput[];
  outputs: RecordingOutput[];
  onChange: (next: { inputs: RecordingInput[]; outputs: RecordingOutput[] }) => void;
  onValidationChange: (errors: IOValidationError[]) => void;
}

export function IOAuthoringPanel(props: Props): JSX.Element {
  const { recording, inputs, outputs, onChange, onValidationChange } = props;
  const fillRows = useMemo(() => extractFillEventRows(recording), [recording]);

  const errors = useMemo(
    () => validateIOAuthoring({ inputs, outputs }),
    [inputs, outputs],
  );

  useEffect(() => {
    onValidationChange(errors);
  }, [errors, onValidationChange]);

  const inputsByEventIndex = useMemo(() => {
    const m = new Map<number, RecordingInput>();
    inputs.forEach((i) => m.set(i.eventIndex, i));
    return m;
  }, [inputs]);

  function setInputForEvent(eventIndex: number, name: string | null): void {
    if (name === null) {
      onChange({
        inputs: inputs.filter((i) => i.eventIndex !== eventIndex),
        outputs,
      });
      return;
    }
    const existing = inputs.find((i) => i.eventIndex === eventIndex);
    if (existing) {
      onChange({
        inputs: inputs.map((i) => (i.eventIndex === eventIndex ? { ...i, name } : i)),
        outputs,
      });
    } else {
      onChange({
        inputs: [...inputs, { name, eventIndex }],
        outputs,
      });
    }
  }

  function addOutput(): void {
    onChange({
      inputs,
      outputs: [...outputs, { name: '', source: { kind: 'url', pattern: '' } }],
    });
  }

  function updateOutput(index: number, next: RecordingOutput): void {
    onChange({
      inputs,
      outputs: outputs.map((o, i) => (i === index ? next : o)),
    });
  }

  function removeOutput(index: number): void {
    onChange({
      inputs,
      outputs: outputs.filter((_, i) => i !== index),
    });
  }

  const inputsOpen = inputs.length > 0;
  const outputsOpen = outputs.length > 0;

  const inputErrors = byField(errors, 'inputs');
  const outputErrors = byField(errors, 'outputs');

  return (
    <div className="io-panel">
      <details className="io-section" open={inputsOpen}>
        <summary>
          Inputs <span className="io-count">({inputs.length})</span>
        </summary>
        {fillRows.length === 0 ? (
          <p className="io-empty">No fill or change events in this recording.</p>
        ) : (
          <ul className="io-input-list">
            {fillRows.map((row) => {
              const declared = inputsByEventIndex.get(row.eventIndex) ?? null;
              const checked = declared !== null;
              const declaredIndex = checked
                ? inputs.findIndex((i) => i.eventIndex === row.eventIndex)
                : -1;
              const errMsg =
                declaredIndex >= 0
                  ? inputErrors.find((e) => e.index === declaredIndex && e.field === 'name')
                      ?.message ?? null
                  : null;
              return (
                <li key={row.eventIndex} className="io-input-row">
                  <label className="io-input-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setInputForEvent(row.eventIndex, e.target.checked ? '' : null)
                      }
                    />
                    <span className="io-input-meta">
                      <span className="io-input-event">#{row.eventIndex}</span>{' '}
                      <span className="io-input-kind">{row.kind}</span>{' '}
                      <code className="io-input-selector" title={row.selectorPreview}>
                        {row.selectorPreview}
                      </code>
                    </span>
                    <span className="io-input-value" title={row.value}>
                      "{truncate(row.value, 24)}"
                      {row.sensitive && (
                        <span className="io-input-sensitive" title="Password field — masked at record time">
                          🔒
                        </span>
                      )}
                    </span>
                  </label>
                  {checked && (
                    <input
                      type="text"
                      className="io-input-name"
                      placeholder="name"
                      value={declared?.name ?? ''}
                      onChange={(e) => setInputForEvent(row.eventIndex, e.target.value)}
                    />
                  )}
                  {errMsg !== null && <p className="io-error">{errMsg}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details className="io-section" open={outputsOpen}>
        <summary>
          Outputs <span className="io-count">({outputs.length})</span>
        </summary>
        {outputs.length === 0 && (
          <p className="io-empty">No outputs declared.</p>
        )}
        <ul className="io-output-list">
          {outputs.map((output, index) => {
            const nameErr = outputErrors.find((e) => e.index === index && e.field === 'name');
            const patternErr = outputErrors.find(
              (e) => e.index === index && (e.field === 'pattern' || e.field === 'selector'),
            );
            return (
              <li key={index} className="io-output-row">
                <input
                  type="text"
                  className="io-output-name"
                  placeholder="name"
                  value={output.name}
                  onChange={(e) =>
                    updateOutput(index, { ...output, name: e.target.value })
                  }
                />
                <select
                  className="io-output-kind"
                  value={output.source.kind}
                  onChange={(e) =>
                    updateOutput(index, {
                      ...output,
                      source: blankSourceFor(e.target.value as 'url' | 'text'),
                    })
                  }
                >
                  <option value="url">from URL</option>
                  <option value="text">from text</option>
                </select>
                {output.source.kind === 'url' ? (
                  <input
                    type="text"
                    className="io-output-pattern"
                    placeholder="/leads/(\d+)"
                    value={output.source.pattern}
                    onChange={(e) =>
                      updateOutput(index, {
                        ...output,
                        source: { kind: 'url', pattern: e.target.value },
                      })
                    }
                  />
                ) : (
                  <input
                    type="text"
                    className="io-output-pattern"
                    placeholder="h1.title"
                    value={output.source.selector}
                    onChange={(e) =>
                      updateOutput(index, {
                        ...output,
                        source: { kind: 'text', selector: e.target.value },
                      })
                    }
                  />
                )}
                <button
                  type="button"
                  className="io-output-remove"
                  aria-label="Remove output"
                  onClick={() => removeOutput(index)}
                >
                  ×
                </button>
                {(nameErr || patternErr) && (
                  <p className="io-error">
                    {nameErr?.message ?? ''}
                    {nameErr && patternErr ? ' ' : ''}
                    {patternErr?.message ?? ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="io-add-btn" onClick={addOutput}>
          + add output
        </button>
      </details>
    </div>
  );
}

function blankSourceFor(kind: 'url' | 'text'): RecordingOutputSource {
  return kind === 'url'
    ? { kind: 'url', pattern: '' }
    : { kind: 'text', selector: '' };
}

function byField(errors: IOValidationError[], scope: 'inputs' | 'outputs'): IOValidationError[] {
  return errors.filter((e) => e.scope === scope);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export type { IOValidationError };
