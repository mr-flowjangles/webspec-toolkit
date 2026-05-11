/**
 * Tests for the pure axe-results → A11yReport normalization.
 *
 * No browser launched; we feed a hand-crafted AxeResults fixture and assert
 * shape, filtering, and severity mapping. These exercise the contract that
 * both Node mode (puppeteer + axe-core/puppeteer) and browser mode (Chrome
 * extension injecting axe-core directly) must hold.
 */
import { describe, it, expect } from 'vitest';
import { normalizeAxeResults } from '../../../src/analyze/a11y/normalize.js';
import { A11yReportSchema } from '../../../src/types/analysis.js';
import { sampleAxeResults } from '../../fixtures/a11y/sample-axe-results.js';

describe('normalizeAxeResults', () => {
  const report = normalizeAxeResults(sampleAxeResults, {
    kind: 'url',
    ref: 'https://example.com/',
  });

  it('produces a contract-valid A11yReport', () => {
    expect(() => A11yReportSchema.parse(report)).not.toThrow();
  });

  it('echoes the target verbatim', () => {
    expect(report.target).toEqual({ kind: 'url', ref: 'https://example.com/' });
  });

  it('records the axe engine version and the full surfaced-tag set', () => {
    expect(report.ruleSet).toEqual({
      tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'section508'],
      engineVersion: '4.10.3',
    });
  });

  it('emits one finding per violating node, not one per rule', () => {
    // 2 image-alt nodes + 1 color-contrast + 1 label + 1 best-practice = 5
    expect(report.findings).toHaveLength(5);
    expect(report.findings.filter((f) => f.ruleId === 'image-alt')).toHaveLength(2);
  });

  it('counts passes and incompletes from the axe result', () => {
    expect(report.passCount).toBe(3);
    expect(report.incompleteCount).toBe(1);
  });

  describe('ruleSets filtering', () => {
    it('surfaces every matching WCAG level + Section 508 when axe tags include them', () => {
      // image-alt fixture is tagged wcag2a + wcag21aa + section508.
      const imageAlt = report.findings.find((f) => f.ruleId === 'image-alt');
      expect(imageAlt?.ruleSets).toEqual(['wcag2a', 'wcag21aa', 'section508']);
    });

    it('preserves multiple WCAG-only tags without section508', () => {
      // color-contrast is tagged wcag2aa + wcag21aa (Level AA on both lines).
      const contrast = report.findings.find((f) => f.ruleId === 'color-contrast');
      expect(contrast?.ruleSets).toEqual(['wcag2aa', 'wcag21aa']);
    });

    it('surfaces Level A WCAG tags alongside section508 (the v0.3.6 fix)', () => {
      // label is tagged wcag2a + section508. Pre-v0.3.6 this surfaced as
      // ['section508'] only, which underreported the WCAG side of the audit.
      const label = report.findings.find((f) => f.ruleId === 'label');
      expect(label?.ruleSets).toEqual(['wcag2a', 'section508']);
    });

    it('emits empty ruleSets when no surfaced tag is present', () => {
      const bp = report.findings.find((f) => f.ruleId === 'best-practice-only');
      expect(bp?.ruleSets).toEqual([]);
    });
  });

  describe('severity mapping', () => {
    it('uses the node impact when present', () => {
      const imageAlt = report.findings.find((f) => f.ruleId === 'image-alt');
      expect(imageAlt?.severity).toBe('critical');
    });

    it("falls back to 'moderate' when impact is null", () => {
      const label = report.findings.find((f) => f.ruleId === 'label');
      expect(label?.severity).toBe('moderate');
    });
  });

  describe('finding shape', () => {
    it('uses the first target selector', () => {
      const findings = report.findings.filter((f) => f.ruleId === 'image-alt');
      expect(findings[0]?.selector).toBe('main > img.hero');
      expect(findings[1]?.selector).toBe('footer > img');
    });

    it('carries failureSummary verbatim', () => {
      const contrast = report.findings.find((f) => f.ruleId === 'color-contrast');
      expect(contrast?.failureSummary).toMatch(/contrast 2.1:1 is below 4.5:1/);
    });

    it('attaches helpUrl when axe provides one', () => {
      const imageAlt = report.findings.find((f) => f.ruleId === 'image-alt');
      expect(imageAlt?.helpUrl).toBe('https://dequeuniversity.com/rules/axe/4.10/image-alt');
    });
  });
});
