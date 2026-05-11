/**
 * Hand-crafted AxeResults fixture for normalize tests. Exercises:
 *  - violations spanning multiple nodes (ruleId repeated, one finding per node)
 *  - tag filtering (wcag21aa-only, section508-only, both, neither)
 *  - severity fallback when `impact` is null/missing
 *  - passCount / incompleteCount derivation
 *
 * Keep this minimal — it's a contract fixture, not an axe regression suite.
 */
import type { AxeResults } from 'axe-core';

export const sampleAxeResults: AxeResults = {
  testEngine: { name: 'axe-core', version: '4.10.3' },
  testRunner: { name: 'axe' },
  testEnvironment: {
    userAgent: 'test',
    windowWidth: 1280,
    windowHeight: 800,
    orientationAngle: 0,
    orientationType: 'landscape-primary',
  },
  timestamp: '2026-05-11T00:00:00.000Z',
  url: 'https://example.com/',
  toolOptions: { reporter: 'v2' },
  violations: [
    {
      id: 'image-alt',
      impact: 'critical',
      tags: ['wcag2a', 'wcag111', 'wcag21aa', 'section508', 'section508.22.a'],
      description: 'Images must have alternate text',
      help: 'Images must have alternate text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      nodes: [
        {
          target: ['main > img.hero'],
          html: '<img class="hero" src="hero.jpg">',
          impact: 'critical',
          failureSummary: 'Fix any of the following: Element does not have an alt attribute',
          any: [],
          all: [],
          none: [],
        },
        {
          target: ['footer > img'],
          html: '<img src="logo.svg">',
          impact: 'critical',
          failureSummary: 'Fix any of the following: Element does not have an alt attribute',
          any: [],
          all: [],
          none: [],
        },
      ],
    },
    {
      id: 'color-contrast',
      impact: 'serious',
      tags: ['cat.color', 'wcag2aa', 'wcag143', 'wcag21aa'],
      description: 'Elements must meet minimum color contrast ratio thresholds',
      help: 'Elements must have sufficient color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
      nodes: [
        {
          target: ['button.cta'],
          html: '<button class="cta">Go</button>',
          impact: 'serious',
          failureSummary: 'Fix any of the following: contrast 2.1:1 is below 4.5:1',
          any: [],
          all: [],
          none: [],
        },
      ],
    },
    {
      id: 'label',
      impact: null,
      tags: ['wcag2a', 'section508', 'section508.22.n'],
      description: 'Form elements must have labels',
      help: 'Form elements must have labels',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
      nodes: [
        {
          target: ['#search'],
          html: '<input id="search" type="text">',
          impact: null,
          failureSummary: 'Fix any of the following: Form element has no label',
          any: [],
          all: [],
          none: [],
        },
      ],
    },
    {
      id: 'best-practice-only',
      impact: 'minor',
      tags: ['best-practice'],
      description: 'Best-practice rule that should produce a finding with empty ruleSets',
      help: 'Best practice',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/best-practice-only',
      nodes: [
        {
          target: ['div.deprecated'],
          html: '<div class="deprecated"></div>',
          impact: 'minor',
          failureSummary: 'Fix any of the following: do not use deprecated pattern',
          any: [],
          all: [],
          none: [],
        },
      ],
    },
  ],
  passes: [
    { id: 'document-title', impact: null, tags: ['wcag2a'], description: '', help: '', helpUrl: '', nodes: [] },
    { id: 'html-has-lang', impact: null, tags: ['wcag2a'], description: '', help: '', helpUrl: '', nodes: [] },
    { id: 'landmark-one-main', impact: null, tags: ['best-practice'], description: '', help: '', helpUrl: '', nodes: [] },
  ],
  incomplete: [
    { id: 'aria-allowed-attr', impact: null, tags: ['wcag2a'], description: '', help: '', helpUrl: '', nodes: [] },
  ],
  inapplicable: [],
};
