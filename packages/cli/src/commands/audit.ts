/**
 * `webspec audit <url>` — Node-mode a11y audit pipeline.
 *
 * Wires the M4 pieces together: `A11yAnalyzer` (Puppeteer + axe) drives the
 * page, the renderer converts the typed `A11yReport` into Markdown or JSON,
 * and we return the formatted output to the shell shim for I/O + exit handling.
 */
import { writeFile } from 'node:fs/promises';
import {
  A11yAnalyzer,
  renderA11yReportJson,
  renderA11yReportMarkdown,
  type Analysis,
} from '@webspec/core';
import type { AuditCommand } from '../args.js';
import { CLI_VERSION } from '../version.js';

export interface AuditResult {
  /** The rendered audit (markdown or JSON) — only set when out is undefined. */
  stdout?: string;
  /** Human-readable summary of what happened (for stderr logging). */
  log: string;
}

export async function runAudit(cmd: AuditCommand): Promise<AuditResult> {
  const analyzer = new A11yAnalyzer();
  const analysis = await analyzer.analyzeUrl({
    url: cmd.url,
    toolVersion: CLI_VERSION,
    config: { tags: ['wcag21aa', 'section508'] },
  });

  const rendered = renderAnalysis(analysis, cmd.format);

  if (cmd.out !== undefined) {
    await writeFile(cmd.out, rendered, 'utf8');
    return { log: summaryLog(analysis, `wrote ${cmd.out}`) };
  }

  return { stdout: rendered, log: summaryLog(analysis, 'wrote to stdout') };
}

function renderAnalysis(analysis: Analysis, format: 'md' | 'json'): string {
  if (analysis.kind !== 'a11yReport') {
    // The analyzer always returns kind: 'a11yReport'; defensive guard for type narrowing.
    throw new Error(`expected a11yReport, got ${analysis.kind}`);
  }
  return format === 'json'
    ? renderA11yReportJson(analysis.data)
    : renderA11yReportMarkdown(analysis.data);
}

function summaryLog(analysis: Analysis, destination: string): string {
  if (analysis.kind !== 'a11yReport') return destination;
  const v = analysis.data.findings.length;
  return `${v} violation${v === 1 ? '' : 's'} · ${destination}`;
}
