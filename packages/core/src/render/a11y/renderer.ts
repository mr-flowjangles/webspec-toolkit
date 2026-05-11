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
import type { A11yReport, A11ySeverity, Finding } from '../../types/analysis.js';

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

  if (report.findings.length === 0) {
    return lines.join('\n').trimEnd() + '\n';
  }

  const grouped = groupBySeverity(report.findings);
  for (const severity of SEVERITY_ORDER) {
    const bucket = grouped[severity];
    if (bucket.length === 0) continue;
    lines.push(`## ${SEVERITY_HEADINGS[severity]} (${bucket.length})`);
    lines.push('');
    lines.push(...renderFindingsTable(bucket));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function formatRuleSetTags(tags: readonly string[]): string {
  // The contract surfaces 'wcag21aa' and 'section508'; format them for humans.
  return tags.map((t) => (t === 'wcag21aa' ? 'WCAG 2.1 AA' : 'Section 508')).join(' + ');
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
  if (sets.length === 0) return '—';
  return sets
    .map((s) => (s === 'wcag21aa' ? 'WCAG 2.1 AA' : s === 'section508' ? 'Section 508' : s))
    .join(', ');
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
