/**
 * A11yReport renderers — pure functions, browser-safe.
 *
 *   renderA11yReportMarkdown — human-readable severity-grouped report. Used
 *     by the CLI for `webspec audit` and the Chrome extension's "Copy report".
 *   renderA11yReportJson — the contract artifact verbatim, pretty-printed.
 *     Used when the consumer is another tool (CI, downstream renderer).
 *
 * No file I/O. No external deps. Mirrors the `renderTestPlan` convention from M2.
 */
import type {
  A11yReport,
  A11yRuleStatus,
  A11ySeverity,
  Finding,
  RuleCheck,
} from '../../types/analysis.js';

/** Highest-impact-first ordering. Drives section order in the markdown output. */
const SEVERITY_ORDER: readonly A11ySeverity[] = ['critical', 'serious', 'moderate', 'minor'];

const SEVERITY_HEADINGS: Readonly<Record<A11ySeverity, string>> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

export function renderA11yReportJson(report: A11yReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderA11yReportMarkdown(report: A11yReport): string {
  const lines: string[] = [];

  lines.push(`# A11y Report — ${report.target.ref}`);
  lines.push('');
  lines.push(
    `axe-core v${report.ruleSet.engineVersion} · ${formatRuleSetTags(report.ruleSet.tags)}`,
  );
  lines.push('');
  lines.push(formatSummaryLine(report));
  lines.push('');

  if (report.findings.length > 0) {
    const grouped = groupBySeverity(report.findings);
    for (const severity of SEVERITY_ORDER) {
      const bucket = grouped[severity];
      if (bucket.length === 0) continue;
      lines.push(`## ${SEVERITY_HEADINGS[severity]} (${bucket.length})`);
      lines.push('');
      lines.push(...renderFindingsTable(bucket));
      lines.push('');
    }
  }

  if (report.rulesChecked.length > 0) {
    const tested = report.rulesChecked.filter((r) => r.status !== 'inapplicable');
    const inapplicable = report.rulesChecked.filter((r) => r.status === 'inapplicable');

    lines.push(`## Rules checked (${report.rulesChecked.length})`);
    lines.push('');
    lines.push(
      `Every axe rule that ran against this page. If a screen-reader or manual review surfaces an issue not in this list, the audit didn't cover that rule.`,
    );
    lines.push('');

    if (tested.length > 0) {
      const reasons = buildFailReasonIndex(report.findings);
      lines.push(`### Tested (${tested.length})`);
      lines.push('');
      lines.push(...renderTestedTable(tested, reasons));
      lines.push('');
    }

    if (inapplicable.length > 0) {
      lines.push(`### Not applicable (${inapplicable.length})`);
      lines.push('');
      lines.push(
        'These rules ran but found no matching elements on the page. Nothing to test.',
      );
      lines.push('');
      lines.push(inapplicable.map((r) => `\`${r.ruleId}\``).join(', '));
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function buildFailReasonIndex(findings: readonly Finding[]): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const f of findings) {
    if (!reasons.has(f.ruleId)) {
      // Collapse the per-node failureSummary the same way the row renderer does.
      reasons.set(f.ruleId, f.failureSummary.replace(/\s*\n\s*/g, ' ').trim());
    }
  }
  return reasons;
}

/**
 * Roll fine-grained tags up to display labels.
 *
 * The contract carries four WCAG tags (`wcag2a`, `wcag2aa`, `wcag21a`,
 * `wcag21aa`) because axe tags rules by the specific criterion. For display
 * we collapse them to a single "WCAG 2.1 AA" — that's the question the user
 * cares about ("am I WCAG 2.1 AA compliant?"). The granular tags stay
 * available on `A11yReport.findings[].ruleSets` for downstream consumers.
 */
function humanizeRuleSets(tags: readonly string[]): string[] {
  const out: string[] = [];
  if (tags.some((t) => t.startsWith('wcag'))) out.push('WCAG 2.1 AA');
  if (tags.includes('section508')) out.push('Section 508');
  return out;
}

function formatRuleSetTags(tags: readonly string[]): string {
  return humanizeRuleSets(tags).join(' + ');
}

function formatSummaryLine(report: A11yReport): string {
  const violationCount = report.findings.length;
  if (violationCount === 0) {
    return `**Clean — no violations.** ${report.passCount} passes · ${report.incompleteCount} incomplete.`;
  }
  return `**${violationCount} violation${violationCount === 1 ? '' : 's'}** · ${report.passCount} passes · ${report.incompleteCount} incomplete.`;
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

function renderFindingsTable(findings: readonly Finding[]): string[] {
  const rows: string[] = [
    '| Rule | Sets | Selector | Issue |',
    '|------|------|----------|-------|',
  ];
  for (const f of findings) {
    rows.push(
      `| ${renderRuleCell(f)} | ${renderSetsCell(f.ruleSets)} | ${renderSelectorCell(f.selector)} | ${renderIssueCell(f.failureSummary)} |`,
    );
  }
  return rows;
}

function renderRuleCell(f: Finding): string {
  return f.helpUrl ? `[${f.ruleId}](${f.helpUrl})` : f.ruleId;
}

function renderSetsCell(sets: readonly string[]): string {
  const labels = humanizeRuleSets(sets);
  return labels.length === 0 ? '—' : labels.join(', ');
}

function renderSelectorCell(selector: string): string {
  // Wrap in inline code. Escape pipes so the table doesn't break; escape
  // backticks defensively (rare in CSS selectors but valid syntax).
  return `\`${selector.replace(/`/g, '\\`').replace(/\|/g, '\\|')}\``;
}

function renderIssueCell(summary: string): string {
  // Collapse newlines (axe failureSummary is multi-line) and escape pipes.
  return summary.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
}

const RULE_STATUS_LABELS: Readonly<Record<A11yRuleStatus, string>> = {
  fail: 'Fail',
  pass: 'Pass',
  incomplete: 'Needs review',
  inapplicable: 'Not applicable',
};

function renderTestedTable(
  checks: readonly RuleCheck[],
  reasons: ReadonlyMap<string, string>,
): string[] {
  const rows: string[] = ['| Rule | Status | Reason |', '|------|--------|--------|'];
  for (const c of checks) {
    const reason = c.status === 'fail' ? (reasons.get(c.ruleId) ?? '') : '';
    rows.push(
      `| ${c.ruleId} | ${RULE_STATUS_LABELS[c.status]} | ${escapeTableCell(reason) || '—'} |`,
    );
  }
  return rows;
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|');
}
