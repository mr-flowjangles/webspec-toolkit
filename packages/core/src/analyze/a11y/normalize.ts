/**
 * Pure normalization from axe-core's `AxeResults` into the `A11yReport`
 * contract artifact. Browser-safe: imports only `axe-core` types and the
 * contract schema. The Node-mode analyzer (`./analyzer.ts`) and the Chrome
 * extension's content script both call this — both run the same axe engine
 * under the hood and both produce `AxeResults`, so normalization lives here.
 */
import type { AxeResults, ImpactValue, Result, NodeResult } from 'axe-core';
import {
  A11yReportSchema,
  type A11yReport,
  type A11yRuleTag,
  type A11ySeverity,
  type Finding,
} from '../../types/analysis.js';

/** Axe tags we surface as `ruleSets` on a Finding. Everything else is dropped. */
const SURFACED_TAGS: readonly A11yRuleTag[] = ['wcag21aa', 'section508'];

/**
 * Axe's `impact` is `'minor' | 'moderate' | 'serious' | 'critical' | null`.
 * The contract requires a concrete severity, so null collapses to 'moderate'
 * (axe's documented default when impact cannot be determined).
 */
function severityOf(impact: ImpactValue | null | undefined): A11ySeverity {
  return impact ?? 'moderate';
}

function ruleSetsFromTags(tags: readonly string[]): A11yRuleTag[] {
  return SURFACED_TAGS.filter((t) => tags.includes(t));
}

/**
 * Axe's `node.target` is an array of CSS selectors that drills through
 * shadow DOM boundaries. For v1 we render the first/topmost selector;
 * the deeper path is preserved on the raw axe result if needed.
 */
function selectorOf(node: NodeResult): string {
  const target = node.target[0];
  return typeof target === 'string' ? target : String(target);
}

function findingFromViolation(rule: Result, node: NodeResult): Finding {
  return {
    ruleId: rule.id,
    ruleSets: ruleSetsFromTags(rule.tags),
    severity: severityOf(node.impact ?? rule.impact),
    selector: selectorOf(node),
    failureSummary: node.failureSummary ?? '',
    ...(rule.helpUrl ? { helpUrl: rule.helpUrl } : {}),
  };
}

export interface NormalizeTarget {
  kind: 'url' | 'dom' | 'staticBundle';
  ref: string;
}

export function normalizeAxeResults(axe: AxeResults, target: NormalizeTarget): A11yReport {
  const findings: Finding[] = axe.violations.flatMap((rule) =>
    rule.nodes.map((node) => findingFromViolation(rule, node)),
  );

  const report: A11yReport = {
    target,
    ruleSet: {
      tags: [...SURFACED_TAGS],
      engineVersion: axe.testEngine.version,
    },
    findings,
    passCount: axe.passes.length,
    incompleteCount: axe.incomplete.length,
  };

  return A11yReportSchema.parse(report);
}
