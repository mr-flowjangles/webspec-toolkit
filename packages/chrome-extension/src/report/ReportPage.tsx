/**
 * Full-page audit report — opens in its own tab via `chrome.tabs.create`.
 *
 * Data handoff: the popup writes the `A11yReport` to `chrome.storage.local`
 * under a unique key, then opens this page with `?id=<key>` in the URL.
 * We read the key, fetch the report, render. If the key is missing or stale
 * (storage cleared, key copied/shared) we surface an honest error.
 *
 * The current layout is a placeholder pending a real design pass — wired data,
 * working downloads, accessible HTML, minimal styling. Swap the markup when
 * the design lands; data shape stays the same.
 */
import { useEffect, useState } from 'react';
import {
  renderA11yReportJson,
  renderA11yReportMarkdown,
  type A11yReport,
  type Finding,
  type A11ySeverity,
  type RuleCheck,
} from '@webspec/core/browser';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: A11yReport };

const SEVERITY_ORDER: readonly A11ySeverity[] = ['critical', 'serious', 'moderate', 'minor'];
const SEVERITY_LABELS: Readonly<Record<A11ySeverity, string>> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

export function ReportPage(): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void loadReportFromStorage().then(setState);
  }, []);

  if (state.kind === 'loading') {
    return <main className="report-page loading">Loading report…</main>;
  }

  if (state.kind === 'error') {
    return (
      <main className="report-page error">
        <h1>Report unavailable</h1>
        <p>{state.message}</p>
        <p>Run the audit again from the webspec popup to view a fresh report.</p>
      </main>
    );
  }

  return <ReadyReport report={state.report} />;
}

function ReadyReport({ report }: { report: A11yReport }): JSX.Element {
  const grouped = groupBySeverity(report.findings);
  const tested = report.rulesChecked.filter((r) => r.status !== 'inapplicable');
  const inapplicable = report.rulesChecked.filter((r) => r.status === 'inapplicable');
  const reasons = buildFailReasonIndex(report.findings);

  return (
    <main className="report-page">
      <header className="report-header">
        <h1>A11y Report</h1>
        <p className="target">
          <a href={report.target.ref} target="_blank" rel="noreferrer">
            {report.target.ref}
          </a>
        </p>
        <p className="meta">
          axe-core v{report.ruleSet.engineVersion} · {humanizeRuleSets(report.ruleSet.tags)}
        </p>
        <DownloadBar report={report} />
      </header>

      <section className="summary">
        <p>{summaryLine(report)}</p>
      </section>

      {report.findings.length === 0 ? (
        <p className="clean">No WCAG 2.1 AA or Section 508 violations found.</p>
      ) : (
        SEVERITY_ORDER.map((sev) => {
          const bucket = grouped[sev];
          if (bucket.length === 0) return null;
          return (
            <section key={sev} className={`severity severity-${sev}`}>
              <h2>
                {SEVERITY_LABELS[sev]} ({bucket.length})
              </h2>
              <ul className="findings">
                {bucket.map((f, i) => (
                  <FindingCard key={`${f.ruleId}-${i}`} finding={f} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {tested.length > 0 && (
        <section className="rules-tested">
          <h2>Rules tested ({tested.length})</h2>
          <p className="hint">
            Every axe rule that produced a meaningful outcome. If a screen-reader or manual
            review surfaces an issue not in this list, the audit didn&apos;t cover that rule.
          </p>
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {tested.map((r) => (
                <tr key={r.ruleId} className={`rule rule-${r.status}`}>
                  <td>
                    <code>{r.ruleId}</code>
                  </td>
                  <td>{statusLabel(r.status)}</td>
                  <td>{r.status === 'fail' ? (reasons.get(r.ruleId) ?? '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {inapplicable.length > 0 && (
        <section className="rules-inapplicable">
          <h2>Not applicable ({inapplicable.length})</h2>
          <p className="hint">
            These rules ran but found no matching elements on the page. Nothing to test.
          </p>
          <p className="inapplicable-list">
            {inapplicable.map((r) => r.ruleId).join(', ')}
          </p>
        </section>
      )}
    </main>
  );
}

function FindingCard({ finding }: { finding: Finding }): JSX.Element {
  return (
    <li className="finding">
      <h3>
        {finding.helpUrl ? (
          <a href={finding.helpUrl} target="_blank" rel="noreferrer">
            {finding.ruleId}
          </a>
        ) : (
          finding.ruleId
        )}
      </h3>
      <p className="finding-meta">{humanizeRuleSets(finding.ruleSets)}</p>
      <p className="finding-selector">
        <code>{finding.selector}</code>
      </p>
      <p className="finding-issue">{collapseWhitespace(finding.failureSummary)}</p>
    </li>
  );
}

function DownloadBar({ report }: { report: A11yReport }): JSX.Element {
  return (
    <div className="downloads">
      <button
        type="button"
        onClick={() => downloadBlob(renderA11yReportMarkdown(report), 'a11y-report.md', 'text/markdown')}
      >
        Download Markdown
      </button>
      <button
        type="button"
        onClick={() => downloadBlob(renderA11yReportJson(report), 'a11y-report.json', 'application/json')}
      >
        Download JSON
      </button>
      <button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers — storage handoff, formatting, status labels.
// ---------------------------------------------------------------------------

async function loadReportFromStorage(): Promise<State> {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('id');
  if (key === null) {
    return { kind: 'error', message: 'No report id in the URL.' };
  }

  try {
    const storage = await chrome.storage.local.get(key);
    const raw = storage[key];
    if (raw === undefined) {
      return {
        kind: 'error',
        message:
          'Report data not found. The popup either cleared the report or this URL was opened from outside the extension.',
      };
    }
    return { kind: 'ready', report: raw as A11yReport };
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function summaryLine(report: A11yReport): string {
  const v = report.findings.length;
  if (v === 0) return `Clean — ${report.passCount} passes · ${report.incompleteCount} incomplete.`;
  return `${v} violation${v === 1 ? '' : 's'} · ${report.passCount} passes · ${report.incompleteCount} incomplete.`;
}

function groupBySeverity(findings: readonly Finding[]): Record<A11ySeverity, Finding[]> {
  const buckets: Record<A11ySeverity, Finding[]> = {
    critical: [],
    serious: [],
    moderate: [],
    minor: [],
  };
  for (const f of findings) buckets[f.severity].push(f);
  return buckets;
}

function buildFailReasonIndex(findings: readonly Finding[]): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const f of findings) {
    if (!reasons.has(f.ruleId)) reasons.set(f.ruleId, collapseWhitespace(f.failureSummary));
  }
  return reasons;
}

function humanizeRuleSets(tags: readonly string[]): string {
  const labels: string[] = [];
  if (tags.some((t) => t.startsWith('wcag'))) labels.push('WCAG 2.1 AA');
  if (tags.includes('section508')) labels.push('Section 508');
  return labels.length === 0 ? '—' : labels.join(' + ');
}

function statusLabel(status: RuleCheck['status']): string {
  switch (status) {
    case 'fail':
      return 'Fail';
    case 'pass':
      return 'Pass';
    case 'incomplete':
      return 'Needs review';
    case 'inapplicable':
      return 'Not applicable';
  }
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}
