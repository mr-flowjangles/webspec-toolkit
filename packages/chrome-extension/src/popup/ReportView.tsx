import { useState } from 'react';
import type {
  A11yReport,
  A11yRuleStatus,
  A11ySeverity,
  Finding,
  RuleCheck,
} from '@webspec/core/browser';

/** Highest-impact-first ordering. Mirrors the markdown renderer. */
const SEVERITY_ORDER: readonly A11ySeverity[] = ['critical', 'serious', 'moderate', 'minor'];

const SEVERITY_LABELS: Readonly<Record<A11ySeverity, string>> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

interface ReportViewProps {
  report: A11yReport;
  onCopy: () => Promise<boolean>;
  onOpenFullReport: () => Promise<void>;
}

export function ReportView({ report, onCopy, onOpenFullReport }: ReportViewProps): JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopyClick(): Promise<void> {
    const ok = await onCopy();
    setCopyState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 1500);
  }

  const grouped = groupBySeverity(report.findings);

  return (
    <section className="report" aria-label="Audit report">
      <div className="report-header">
        <p className="report-summary">{summaryLine(report)}</p>
        <div className="report-actions">
          <button type="button" className="open-report-btn" onClick={onOpenFullReport}>
            Open full report ↗
          </button>
          <button type="button" className="copy-btn" onClick={handleCopyClick}>
            {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy as Markdown'}
          </button>
        </div>
      </div>

      {report.findings.length === 0 ? (
        <p className="report-clean">No WCAG 2.1 AA or Section 508 violations found.</p>
      ) : (
        SEVERITY_ORDER.map((sev) => {
          const bucket = grouped[sev];
          if (bucket.length === 0) return null;
          return (
            <div key={sev} className={`severity severity-${sev}`}>
              <h2>
                {SEVERITY_LABELS[sev]} <span className="count">({bucket.length})</span>
              </h2>
              <ul className="findings">
                {bucket.map((f, i) => (
                  <FindingItem key={`${f.ruleId}-${i}`} finding={f} />
                ))}
              </ul>
            </div>
          );
        })
      )}

      {report.rulesChecked.length > 0 && (
        <RulesCheckedPanels rules={report.rulesChecked} findings={report.findings} />
      )}
    </section>
  );
}

const STATUS_LABELS: Readonly<Record<A11yRuleStatus, string>> = {
  fail: 'Fail',
  pass: 'Pass',
  incomplete: 'Needs review',
  inapplicable: 'N/A',
};

interface RulesPanelsProps {
  rules: readonly RuleCheck[];
  findings: readonly Finding[];
}

function RulesCheckedPanels({ rules, findings }: RulesPanelsProps): JSX.Element {
  const tested = rules.filter((r) => r.status !== 'inapplicable');
  const inapplicable = rules.filter((r) => r.status === 'inapplicable');
  const reasonByRule = buildFailReasonIndex(findings);

  return (
    <div className="rules-checked-group">
      <p className="rules-checked-hint">
        Every axe rule that ran against this page. If a screen-reader or manual review surfaces
        something not in this list, the audit didn&apos;t cover that rule.
      </p>

      {tested.length > 0 && (
        <details className="rules-checked" open>
          <summary>
            Tested <span className="count">({tested.length})</span>
          </summary>
          <ul className="rules-list">
            {tested.map((r) => (
              <li key={r.ruleId} className={`rule rule-${r.status}`}>
                <div className="rule-row">
                  <code>{r.ruleId}</code>
                  <span className="rule-status">{STATUS_LABELS[r.status]}</span>
                </div>
                {r.status === 'fail' && reasonByRule.has(r.ruleId) && (
                  <p className="rule-reason">{reasonByRule.get(r.ruleId)}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {inapplicable.length > 0 && (
        <details className="rules-checked">
          <summary>
            Not applicable <span className="count">({inapplicable.length})</span>
          </summary>
          <p className="rules-checked-hint inapplicable-hint">
            These rules ran but found no matching elements on the page. Nothing to test.
          </p>
          <p className="inapplicable-list">
            {inapplicable.map((r, i) => (
              <span key={r.ruleId}>
                <code>{r.ruleId}</code>
                {i < inapplicable.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </details>
      )}
    </div>
  );
}

/**
 * Build a ruleId → first-failureSummary map so each fail row in the "Tested"
 * panel can show why the rule failed. axe's failureSummary is per-node; we
 * surface the first node's reason since they're usually the same family.
 */
function buildFailReasonIndex(findings: readonly Finding[]): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const f of findings) {
    if (!reasons.has(f.ruleId)) reasons.set(f.ruleId, collapseWhitespace(f.failureSummary));
  }
  return reasons;
}

function FindingItem({ finding }: { finding: Finding }): JSX.Element {
  return (
    <li className="finding">
      <p className="finding-head">
        {finding.helpUrl ? (
          <a href={finding.helpUrl} target="_blank" rel="noreferrer">
            {finding.ruleId}
          </a>
        ) : (
          <strong>{finding.ruleId}</strong>
        )}
        <span className="sets">{humanizeRuleSets(finding.ruleSets)}</span>
      </p>
      <p className="finding-selector">
        <code>{finding.selector}</code>
      </p>
      <p className="finding-issue">{collapseWhitespace(finding.failureSummary)}</p>
    </li>
  );
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

function humanizeRuleSets(tags: readonly string[]): string {
  // Mirrors `humanizeRuleSets` in the markdown renderer: roll any wcag* tag
  // up to a single "WCAG 2.1 AA" label.
  const labels: string[] = [];
  if (tags.some((t) => t.startsWith('wcag'))) labels.push('WCAG 2.1 AA');
  if (tags.includes('section508')) labels.push('Section 508');
  return labels.length === 0 ? '—' : labels.join(', ');
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim();
}
