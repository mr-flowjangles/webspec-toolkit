/**
 * Tests for renderA11yReportMarkdown + renderA11yReportJson.
 *
 * Pipes the shared axe fixture through `normalizeAxeResults` → renderer so
 * we exercise the realistic Finding shape (severity bucketing, ruleSets
 * filtering, helpUrl wiring) rather than constructing reports by hand. Edge
 * cases (zero findings, missing helpUrl, empty ruleSets) get their own
 * minimal inline fixtures.
 */
import { describe, it, expect } from 'vitest';
import { normalizeAxeResults } from '../../../src/analyze/a11y/normalize.js';
import {
  renderA11yReportMarkdown,
  renderA11yReportJson,
} from '../../../src/render/a11y/renderer.js';
import { A11yReportSchema, type A11yReport } from '../../../src/types/analysis.js';
import { sampleAxeResults } from '../../fixtures/a11y/sample-axe-results.js';

const sampleReport = normalizeAxeResults(sampleAxeResults, {
  kind: 'url',
  ref: 'https://example.com/',
});

describe('renderA11yReportMarkdown — sample fixture', () => {
  const md = renderA11yReportMarkdown(sampleReport);

  it('opens with the target ref in an H1', () => {
    expect(md).toMatch(/^# A11y Report — https:\/\/example\.com\/\n/);
  });

  it('shows axe engine version and human-readable rule sets', () => {
    expect(md).toContain('axe-core v4.10.3 · WCAG 2.1 AA + Section 508');
  });

  it('summarizes violation count + passes + incomplete', () => {
    expect(md).toContain('**5 violations** · 3 passes · 1 incomplete.');
  });

  it('groups by severity in critical→serious→moderate→minor order', () => {
    const idxCritical = md.indexOf('## Critical');
    const idxSerious = md.indexOf('## Serious');
    const idxModerate = md.indexOf('## Moderate');
    const idxMinor = md.indexOf('## Minor');
    expect(idxCritical).toBeGreaterThan(-1);
    expect(idxSerious).toBeGreaterThan(idxCritical);
    expect(idxModerate).toBeGreaterThan(idxSerious);
    expect(idxMinor).toBeGreaterThan(idxModerate);
  });

  it('renders the section heading with a per-bucket count', () => {
    expect(md).toContain('## Critical (2)');
    expect(md).toContain('## Serious (1)');
    expect(md).toContain('## Moderate (1)');
    expect(md).toContain('## Minor (1)');
  });

  it('renders one row per finding, not per rule', () => {
    // image-alt has 2 nodes in the fixture → 2 rows in the Critical section.
    const criticalSection = md
      .split('## Critical')[1]!
      .split('## ')[0]!; // up to next section
    const dataRows = criticalSection
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Rule '));
    expect(dataRows).toHaveLength(2);
    expect(dataRows.every((l) => l.includes('image-alt'))).toBe(true);
  });

  it('links the rule id to helpUrl when present', () => {
    expect(md).toContain(
      '[image-alt](https://dequeuniversity.com/rules/axe/4.10/image-alt)',
    );
  });

  it('rolls all WCAG levels up to a single "WCAG 2.1 AA" label', () => {
    // image-alt is tagged wcag2a + wcag21aa + section508 → both labels.
    expect(md).toContain('WCAG 2.1 AA, Section 508');
    // color-contrast is tagged wcag2aa + wcag21aa → single WCAG label, no Section 508.
    const contrastRow = md.split('\n').find((l) => l.includes('color-contrast'))!;
    expect(contrastRow).toContain('| WCAG 2.1 AA |');
    expect(contrastRow).not.toContain('Section 508');
  });

  it('treats Level A wcag tags as a WCAG label, not a Section-508-only finding', () => {
    // The v0.3.6 fix: label was tagged wcag2a + section508; pre-fix it
    // rendered as Section 508 only, which underreported WCAG.
    const labelRow = md.split('\n').find((l) => l.startsWith('| ') && l.includes('label'))!;
    expect(labelRow).toContain('WCAG 2.1 AA, Section 508');
  });

  it('renders empty ruleSets as an em-dash', () => {
    // best-practice-only finding sits in Minor. (It has a helpUrl in the
    // fixture so the rule cell renders as a markdown link.)
    const minorSection = md.split('## Minor')[1]!;
    expect(minorSection).toContain('best-practice-only');
    expect(minorSection).toContain('| — |');
  });

  it('wraps selectors in inline code', () => {
    expect(md).toContain('`main > img.hero`');
    expect(md).toContain('`button.cta`');
    expect(md).toContain('`#search`');
  });

  it('ends with a trailing newline', () => {
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('renderA11yReportMarkdown — edge cases', () => {
  it('emits a clean-report short-circuit when there are no findings', () => {
    const clean: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://clean.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [],
      rulesChecked: [],
      passCount:42,
      incompleteCount: 0,
    });
    const md = renderA11yReportMarkdown(clean);
    expect(md).toContain('**Clean — no violations.** 42 passes · 0 incomplete.');
    expect(md).not.toContain('## Critical');
    expect(md).not.toContain('## Serious');
    expect(md).not.toContain('## Moderate');
    expect(md).not.toContain('## Minor');
  });

  it('falls back to plain text rule id when helpUrl is missing', () => {
    const report: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://no-help.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [
        {
          ruleId: 'mystery-rule',
          ruleSets: ['wcag21aa'],
          severity: 'moderate',
          selector: 'body',
          failureSummary: 'Something went wrong',
        },
      ],
      rulesChecked: [],
      passCount:0,
      incompleteCount: 0,
    });
    const md = renderA11yReportMarkdown(report);
    expect(md).toContain('| mystery-rule |');
    expect(md).not.toContain('](');
  });

  it('escapes pipe characters inside selectors and issue text', () => {
    const report: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://pipey.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [
        {
          ruleId: 'pipey',
          ruleSets: ['wcag21aa'],
          severity: 'minor',
          selector: 'a[href*="|"]',
          failureSummary: 'Use a or b | not both',
        },
      ],
      rulesChecked: [],
      passCount:0,
      incompleteCount: 0,
    });
    const md = renderA11yReportMarkdown(report);
    expect(md).toContain('`a[href*="\\|"]`');
    expect(md).toContain('Use a or b \\| not both');
  });

  it('collapses multi-line failureSummary into one row line', () => {
    const report: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://multiline.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [
        {
          ruleId: 'multiline',
          ruleSets: ['wcag21aa'],
          severity: 'serious',
          selector: 'p',
          failureSummary: 'Fix any of the following:\n  Element has no alt\n  Element is hidden',
        },
      ],
      rulesChecked: [],
      passCount:0,
      incompleteCount: 0,
    });
    const md = renderA11yReportMarkdown(report);
    expect(md).toContain(
      'Fix any of the following: Element has no alt Element is hidden',
    );
    // The single row must not contain a raw newline.
    const seriousSection = md.split('## Serious')[1]!.split('## ')[0]!;
    const rowLines = seriousSection.split('\n').filter((l) => l.startsWith('| multiline'));
    expect(rowLines).toHaveLength(1);
  });

  it('singularizes "violation" when count is 1', () => {
    const report: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://one.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [
        {
          ruleId: 'solo',
          ruleSets: ['wcag21aa'],
          severity: 'critical',
          selector: 'main',
          failureSummary: 'Something',
        },
      ],
      rulesChecked: [],
      passCount:5,
      incompleteCount: 0,
    });
    const md = renderA11yReportMarkdown(report);
    expect(md).toContain('**1 violation** · 5 passes · 0 incomplete.');
  });
});

describe('renderA11yReportMarkdown — Rules checked appendix', () => {
  const md = renderA11yReportMarkdown(sampleReport);

  it('emits an H2 heading with the rule count', () => {
    expect(md).toContain('## Rules checked (9)');
  });

  it('explains the section purpose for readers seeing a clean-but-still-broken page', () => {
    expect(md).toContain(
      "If a screen-reader or manual review surfaces an issue not in this list, the audit didn't cover that rule.",
    );
  });

  it('lists each rule with its humanized status', () => {
    expect(md).toContain('| image-alt | Fail |');
    expect(md).toContain('| document-title | Pass |');
    expect(md).toContain('| aria-allowed-attr | Needs review |');
    expect(md).toContain('| audio-caption | Not applicable |');
  });

  it('omits the appendix when rulesChecked is empty', () => {
    const empty: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://nothing.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [],
      rulesChecked: [],
      passCount: 0,
      incompleteCount: 0,
    });
    expect(renderA11yReportMarkdown(empty)).not.toContain('## Rules checked');
  });

  it('still emits the appendix on otherwise-clean reports (zero findings)', () => {
    const clean: A11yReport = A11yReportSchema.parse({
      target: { kind: 'url', ref: 'https://clean.example/' },
      ruleSet: { tags: ['wcag21aa', 'section508'], engineVersion: '4.10.3' },
      findings: [],
      rulesChecked: [
        { ruleId: 'document-title', status: 'pass' },
        { ruleId: 'html-has-lang', status: 'pass' },
      ],
      passCount: 2,
      incompleteCount: 0,
    });
    const out = renderA11yReportMarkdown(clean);
    expect(out).toContain('## Rules checked (2)');
    expect(out).toContain('| document-title | Pass |');
  });
});

describe('renderA11yReportJson', () => {
  it('round-trips through JSON.parse to the original A11yReport', () => {
    const json = renderA11yReportJson(sampleReport);
    const parsed = JSON.parse(json);
    expect(() => A11yReportSchema.parse(parsed)).not.toThrow();
    expect(parsed).toEqual(sampleReport);
  });

  it('is pretty-printed with 2-space indent', () => {
    const json = renderA11yReportJson(sampleReport);
    expect(json).toContain('\n  "target":');
    expect(json).toContain('\n  "ruleSet":');
  });
});
