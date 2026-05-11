/**
 * Full-page audit report — opens in its own tab via `chrome.tabs.create`.
 *
 * Visual design: Claude design / Artifacts (v0.4.2). Bellese Prussian Blue
 * accent, severity colors per axe impact, dark mode via prefers-color-scheme,
 * print stylesheet hides downloads. Tokens + components live in `report.css`.
 *
 * Data flow: popup writes `{ scannedAt, report }` to chrome.storage.local
 * under a unique key; this page reads via `?id=<key>` from the URL.
 */
import { useEffect, useState } from 'react';
import {
  renderA11yReportJson,
  renderA11yReportMarkdown,
  type A11yReport,
  type A11yRuleStatus,
  type A11ySeverity,
  type Finding,
  type RuleCheck,
} from '@webspec/core/browser';

interface StashedReport {
  scannedAt: string;
  report: A11yReport;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: A11yReport; scannedAt: string };

const SEVERITY_ORDER: readonly A11ySeverity[] = ['critical', 'serious', 'moderate', 'minor'];
const SEVERITY_LABELS: Readonly<Record<A11ySeverity, string>> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};
const STATUS_LABELS: Readonly<Record<A11yRuleStatus, string>> = {
  fail: 'Fail',
  pass: 'Pass',
  incomplete: 'Needs review',
  inapplicable: 'Not applicable',
};

export function ReportPage(): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    void loadReportFromStorage().then(setState);
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="page is-loading">
        <p>Loading report…</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="page is-error">
        <h1>Report unavailable</h1>
        <p>{state.message}</p>
        <p>Run the audit again from the webspec popup to view a fresh report.</p>
      </div>
    );
  }

  return <ReadyReport report={state.report} scannedAt={state.scannedAt} />;
}

function ReadyReport({
  report,
  scannedAt,
}: {
  report: A11yReport;
  scannedAt: string;
}): JSX.Element {
  const grouped = groupBySeverity(report.findings);
  const sevCounts: Record<A11ySeverity, number> = {
    critical: grouped.critical.length,
    serious: grouped.serious.length,
    moderate: grouped.moderate.length,
    minor: grouped.minor.length,
  };
  const failingRuleCount = countFailingRules(report.findings);
  const tested = report.rulesChecked.filter((r) => r.status !== 'inapplicable');
  const inapplicable = report.rulesChecked.filter((r) => r.status === 'inapplicable');
  const reasons = buildFailReasonIndex(report.findings);
  const testedCounts = countTestedStatuses(tested);
  const ruleSetLabel = humanizeRuleSets(report.ruleSet.tags);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to report content
      </a>

      <div className="page">
        <main id="main">
          {/* COVER */}
          <header className="cover" aria-labelledby="report-title">
            <div className="eyebrow" aria-hidden="true">
              Accessibility audit
            </div>
            <h1 id="report-title">A11y Report</h1>
            <a className="target" href={report.target.ref} rel="noopener noreferrer">
              {report.target.ref}
            </a>

            <dl className="meta">
              <div>
                <dt>Target</dt>
                <dd>{labelForTargetKind(report.target.kind)}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>
                  axe-core <code>{report.ruleSet.engineVersion}</code>
                </dd>
              </div>
              <div>
                <dt>Rule set</dt>
                <dd>{ruleSetLabel || '—'}</dd>
              </div>
              <div>
                <dt>Scanned</dt>
                <dd>
                  <time dateTime={scannedAt}>{formatScannedAt(scannedAt)}</time>
                </dd>
              </div>
            </dl>

            <div className="downloads" role="group" aria-label="Download report">
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadBlob(renderA11yReportMarkdown(report), 'a11y-report.md', 'text/markdown')
                }
              >
                <DownloadIcon />
                Markdown
              </button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadBlob(
                    renderA11yReportJson(report),
                    'a11y-report.json',
                    'application/json',
                  )
                }
              >
                <DownloadIcon />
                JSON
              </button>
              <button className="btn" type="button" onClick={() => window.print()}>
                <PrintIcon />
                Print
              </button>
            </div>
          </header>

          {/* SUMMARY */}
          <section className="section summary" aria-labelledby="summary-h">
            <div className="section-head">
              <h2 id="summary-h">Summary</h2>
              <span className="section-meta">{summaryMetaLine(report, failingRuleCount)}</span>
            </div>

            <div className="summary-grid">
              <div className="stat is-total">
                <div className="stat-value">{report.findings.length}</div>
                <div className="stat-label">Total violations</div>
                <div className="stat-sub">
                  {failingRuleCount} rule{failingRuleCount === 1 ? '' : 's'} failing
                </div>
              </div>
              {SEVERITY_ORDER.map((sev) => (
                <div
                  key={sev}
                  className={`stat sev-${sev}${sevCounts[sev] === 0 ? ' is-zero' : ''}`}
                >
                  <div className="stat-value">{sevCounts[sev]}</div>
                  <div className="stat-label">
                    <span className="dot" aria-hidden="true" />
                    {SEVERITY_LABELS[sev]}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* VIOLATIONS */}
          {report.findings.length > 0 && (
            <section className="section" aria-labelledby="violations-h">
              <div className="section-head">
                <h2 id="violations-h">Violations</h2>
                <span className="section-meta">Grouped by severity</span>
              </div>

              {SEVERITY_ORDER.map((sev) => {
                const bucket = grouped[sev];
                if (bucket.length === 0) return null;
                return (
                  <section
                    key={sev}
                    className="severity-group"
                    aria-labelledby={`sev-${sev}-h`}
                  >
                    <div className="severity-group-head">
                      <span className={`sev-bar sev-${sev}-bar`} aria-hidden="true" />
                      <h3 id={`sev-${sev}-h`}>{SEVERITY_LABELS[sev]}</h3>
                      <span className="count">
                        {bucket.length} finding{bucket.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="findings-list">
                      {bucket.map((f, i) => (
                        <FindingCard key={`${f.ruleId}-${i}`} finding={f} severity={sev} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </section>
          )}

          {/* RULES TESTED */}
          {tested.length > 0 && (
            <section className="section" aria-labelledby="rules-h">
              <div className="section-head">
                <h2 id="rules-h">Rules tested</h2>
                <span className="section-meta">{testedMetaLine(tested.length, testedCounts)}</span>
              </div>
              <div className="table-wrap">
                <table className="rules">
                  <thead>
                    <tr>
                      <th scope="col">Rule</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tested.map((r) => {
                      const reason = r.status === 'fail' ? reasons.get(r.ruleId) ?? '' : '';
                      return (
                        <tr key={r.ruleId}>
                          <td className="rule-cell">{r.ruleId}</td>
                          <td className="status-cell">
                            <span className={`status is-${r.status}`}>
                              {STATUS_LABELS[r.status]}
                            </span>
                          </td>
                          <td className="reason-cell">
                            {reason !== '' ? (
                              reason
                            ) : (
                              <span className="dash" aria-hidden="true">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* NOT APPLICABLE */}
          {inapplicable.length > 0 && (
            <section className="section not-applicable" aria-labelledby="na-h">
              <div className="section-head">
                <h2 id="na-h">Not applicable</h2>
                <span className="section-meta">
                  Rules that did not match any element on this page
                </span>
              </div>
              <p className="na-body">
                <span className="na-count">
                  {inapplicable.length} rule{inapplicable.length === 1 ? '' : 's'}
                </span>
                {inapplicable.map((r) => r.ruleId).join(', ')}
              </p>
            </section>
          )}

          {/* FOOTER */}
          <footer className="page-foot">
            <span>
              Generated by axe-core {report.ruleSet.engineVersion} · {ruleSetLabel}
            </span>
            <span>webspec</span>
          </footer>
        </main>
      </div>
    </>
  );
}

function FindingCard({
  finding,
  severity,
}: {
  finding: Finding;
  severity: A11ySeverity;
}): JSX.Element {
  const tags = humanizeRuleSetsList(finding.ruleSets);
  return (
    <article className="finding">
      <div className="finding-head">
        <div className="finding-title">
          <h4>
            {finding.helpUrl ? (
              <a href={finding.helpUrl} rel="noopener noreferrer">
                {finding.ruleId}
              </a>
            ) : (
              finding.ruleId
            )}
          </h4>
          <span className="tag-list">
            {tags.length === 0 ? (
              <span className="tag is-empty">Best practice</span>
            ) : (
              tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))
            )}
          </span>
        </div>
        <span className={`sev-pill sev-${severity}`}>
          <span className="dot" aria-hidden="true" />
          {SEVERITY_LABELS[severity]}
        </span>
      </div>
      <code className="selector">{finding.selector}</code>
      <p className="failure-summary">{collapseWhitespace(finding.failureSummary)}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Icons — inline SVGs matching the design's stroke style.
// ---------------------------------------------------------------------------

function DownloadIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  );
}

function PrintIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6z" />
    </svg>
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
    const raw = storage[key] as StashedReport | undefined;
    if (raw === undefined) {
      return {
        kind: 'error',
        message:
          'Report data not found. The popup either cleared the report or this URL was opened from outside the extension.',
      };
    }
    return { kind: 'ready', report: raw.report, scannedAt: raw.scannedAt };
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

function summaryMetaLine(report: A11yReport, failingRuleCount: number): string {
  const v = report.findings.length;
  if (v === 0) {
    return `Clean — ${report.passCount} passing · ${report.incompleteCount} needs review`;
  }
  return `${v} violation${v === 1 ? '' : 's'} across ${failingRuleCount} rule${
    failingRuleCount === 1 ? '' : 's'
  } · ${report.passCount} passing · ${report.incompleteCount} needs review`;
}

function testedMetaLine(
  total: number,
  counts: { fail: number; pass: number; incomplete: number },
): string {
  const bits: string[] = [`${total} rule${total === 1 ? '' : 's'}`];
  if (counts.fail > 0) bits.push(`${counts.fail} fail`);
  if (counts.pass > 0) bits.push(`${counts.pass} pass`);
  if (counts.incomplete > 0) {
    bits.push(`${counts.incomplete} needs review`);
  }
  return bits.join(' · ');
}

function countTestedStatuses(
  rules: readonly RuleCheck[],
): { fail: number; pass: number; incomplete: number } {
  return rules.reduce(
    (acc, r) => {
      if (r.status === 'fail') acc.fail++;
      else if (r.status === 'pass') acc.pass++;
      else if (r.status === 'incomplete') acc.incomplete++;
      return acc;
    },
    { fail: 0, pass: 0, incomplete: 0 },
  );
}

function countFailingRules(findings: readonly Finding[]): number {
  return new Set(findings.map((f) => f.ruleId)).size;
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
  return humanizeRuleSetsList(tags).join(', ');
}

function humanizeRuleSetsList(tags: readonly string[]): string[] {
  const labels: string[] = [];
  if (tags.some((t) => t.startsWith('wcag'))) labels.push('WCAG 2.1 AA');
  if (tags.includes('section508')) labels.push('Section 508');
  if (tags.includes('best-practice')) labels.push('Best practice');
  return labels;
}

function labelForTargetKind(kind: A11yReport['target']['kind']): string {
  switch (kind) {
    case 'url':
      return 'URL';
    case 'dom':
      return 'DOM';
    case 'staticBundle':
      return 'Static bundle';
  }
}

function formatScannedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}
