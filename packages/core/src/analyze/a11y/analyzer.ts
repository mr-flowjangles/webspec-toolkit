/**
 * A11yAnalyzer — Node-mode entry point. Drives Puppeteer + @axe-core/puppeteer
 * against a URL, then normalizes into the `A11yReport` contract artifact.
 *
 * Node-only. Imports `puppeteer` (heavy, bundles Chromium); browser bundles
 * (Chrome extension) must exclude this module and call `normalizeAxeResults`
 * directly with their own `AxeResults`.
 */
import { AxePuppeteer } from '@axe-core/puppeteer';
import type { AxeResults } from 'axe-core';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { A11yRuleTag, Analysis } from '../../types/analysis.js';
import { normalizeAxeResults } from './normalize.js';

/**
 * Tags passed to axe-core. Matches the v1 a11y scope: WCAG 2.1 AA + Section 508 +
 * axe's curated best-practice rules. Level A tags are included because "WCAG 2.1
 * AA compliance" requires meeting Level A criteria too (axe tags rules by the
 * specific criterion, so `image-alt` is `wcag2a`, not `wcag21aa`). The
 * `best-practice` set (v0.5.0) adds ~30 hygiene rules like `landmark-one-main`,
 * `region`, and `heading-order` that human a11y reviewers tend to flag too.
 */
export const DEFAULT_A11Y_TAGS: readonly A11yRuleTag[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'section508',
  'best-practice',
];

export interface AnalyzeUrlOptions {
  url: string;
  /** Tool version for the resulting Analysis.meta. Caller-provided. */
  toolVersion: string;
  /** Resolved config snapshot for the resulting Analysis.meta. */
  config: unknown;
  /** Axe tag set override. Defaults to WCAG 2.1 AA + Section 508. */
  tags?: readonly A11yRuleTag[];
}

export interface AnalyzePageOptions {
  page: Page;
  /** Logical source ref for the resulting Analysis.meta (e.g. the URL). */
  ref: string;
  toolVersion: string;
  config: unknown;
  tags?: readonly A11yRuleTag[];
}

export class A11yAnalyzer {
  /**
   * Run axe against a URL. Launches a headless Chromium, navigates, waits for
   * network idle, runs the audit, then closes the browser.
   */
  async analyzeUrl(opts: AnalyzeUrlOptions): Promise<Analysis> {
    const browser: Browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(opts.url, { waitUntil: 'networkidle2' });
      return await this.analyzePage({
        page,
        ref: opts.url,
        toolVersion: opts.toolVersion,
        config: opts.config,
        tags: opts.tags,
      });
    } finally {
      await browser.close();
    }
  }

  /**
   * Run axe against an already-loaded Puppeteer page. Useful when the caller
   * has its own browser lifecycle (CI harness, M5 verification scripts).
   */
  async analyzePage(opts: AnalyzePageOptions): Promise<Analysis> {
    const tags = opts.tags ?? DEFAULT_A11Y_TAGS;
    const axe: AxeResults = await new AxePuppeteer(opts.page).withTags([...tags]).analyze();

    const data = normalizeAxeResults(axe, { kind: 'url', ref: opts.ref });

    return {
      kind: 'a11yReport',
      data,
      meta: {
        schemaVersion: '1',
        toolVersion: opts.toolVersion,
        createdAt: new Date().toISOString(),
        source: { kind: 'url', ref: opts.ref },
        config: opts.config,
      },
    };
  }
}
