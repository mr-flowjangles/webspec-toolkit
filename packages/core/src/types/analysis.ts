/**
 * The Analysis contract artifact.
 *
 * Every Phase 1 analyzer produces an `Analysis`. Every Phase 2 renderer (and every
 * UI surface) consumes one. Three variants today: `TestPlan` (source-driven unit
 * test gen), `A11yReport` (axe-core a11y audit), and `WorkflowRecording` (browser
 * workflow capture). See docs/01-architecture.md and docs/02-contract-spec.md.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared envelope
// ---------------------------------------------------------------------------

export const AnalysisMetaSchema = z.object({
  schemaVersion: z.literal('1'),
  toolVersion: z.string(),
  createdAt: z.string(), // ISO-8601
  source: z.object({
    kind: z.enum(['file', 'url', 'dom', 'recordingSession']),
    ref: z.string(),
  }),
  // ResolvedConfig is owned by @webspec/config; in core we accept any shape
  // and let the consumer narrow it. Keeps core free of a config-package dependency.
  config: z.unknown(),
});

// ---------------------------------------------------------------------------
// Variant 1 — TestPlan (Jest unit tests from Angular source)
// ---------------------------------------------------------------------------

export const SurfaceInputSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  isSignal: z.boolean(),
});

export const SurfaceOutputSchema = z.object({
  name: z.string(),
  emitsType: z.string(),
  isSignalOutput: z.boolean(),
});

export const SurfaceMethodSchema = z.object({
  name: z.string(),
  signature: z.string(),
});

export const LifecycleHookSchema = z.enum([
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngAfterViewInit',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewChecked',
  'ngDoCheck',
]);

export const InjectedDepSchema = z.object({
  name: z.string(),
  type: z.string(),
  via: z.enum(['inject', 'constructor']),
});

export const TestCaseSchema = z.object({
  name: z.string(),
  arrange: z.string(),
  act: z.string(),
  assert: z.string(),
  imports: z.array(z.string()).optional(),
});

export const TestPlanSchema = z.object({
  unit: z.object({
    kind: z.enum(['component', 'service', 'directive', 'pipe']),
    name: z.string(),
    filePath: z.string(),
  }),
  surface: z.object({
    inputs: z.array(SurfaceInputSchema),
    outputs: z.array(SurfaceOutputSchema),
    publicMethods: z.array(SurfaceMethodSchema),
    lifecycle: z.array(LifecycleHookSchema),
    deps: z.array(InjectedDepSchema),
  }),
  cases: z.array(TestCaseSchema),
  framework: z.literal('jest'),
  styleHints: z.object({
    useStandalone: z.boolean(),
    useSignals: z.boolean(),
    useInject: z.boolean(),
  }),
});

// ---------------------------------------------------------------------------
// Variant 2 — A11yReport (axe-core findings, WCAG 2.1 AA + Section 508)
// ---------------------------------------------------------------------------

/**
 * Rule-set tags surfaced on each `Finding.ruleSets` and on `A11yReport.ruleSet.tags`.
 *
 * "WCAG 2.1 AA compliance" per W3C convention means meeting Level A + Level AA
 * criteria, so the WCAG set covers four axe tags: `wcag2a`, `wcag2aa`, `wcag21a`,
 * `wcag21aa`. Renderers roll these up to a single "WCAG 2.1 AA" label for display
 * while the contract preserves the granular breakdown for downstream consumers.
 *
 * `best-practice` covers axe's curated hygiene rules (`landmark-one-main`,
 * `region`, `page-has-heading-one`, `heading-order`, etc.). They aren't strict
 * WCAG/508 failures, but JAWS-style human reviewers tend to flag the same
 * issues — surfacing them broadens the automated coverage at no per-audit cost.
 */
export const A11yRuleTagSchema = z.enum([
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'section508',
  'best-practice',
]);

export const A11ySeveritySchema = z.enum(['minor', 'moderate', 'serious', 'critical']);

export const FindingSchema = z.object({
  ruleId: z.string(),
  ruleSets: z.array(A11yRuleTagSchema),
  severity: A11ySeveritySchema,
  selector: z.string(),
  failureSummary: z.string(),
  fixHint: z.string().optional(),
  helpUrl: z.url().optional(),
});

/**
 * Status of an individual axe rule against the audited page.
 *
 * Axe reports four buckets per scan: violations (`fail`), passes (`pass`),
 * incomplete (`incomplete` — axe couldn't determine, needs human review),
 * and inapplicable (`inapplicable` — no matching elements on the page).
 * We carry all four in `A11yReport.rulesChecked` so consumers can answer
 * "did the audit actually test for this?" — important when a screen-reader
 * or manual check surfaces something the report didn't.
 */
export const A11yRuleStatusSchema = z.enum(['pass', 'fail', 'incomplete', 'inapplicable']);

export const RuleCheckSchema = z.object({
  ruleId: z.string(),
  status: A11yRuleStatusSchema,
});

export const A11yReportSchema = z.object({
  target: z.object({
    kind: z.enum(['url', 'dom', 'staticBundle']),
    ref: z.string(),
  }),
  ruleSet: z.object({
    tags: z.array(A11yRuleTagSchema),
    engineVersion: z.string(),
  }),
  findings: z.array(FindingSchema),
  /**
   * Every axe rule that ran against the page, with its outcome. Sorted by
   * `ruleId` for deterministic rendering. Includes the rule IDs behind
   * `findings` (with `status: 'fail'`), so this is the canonical "what did
   * the audit cover" list.
   */
  rulesChecked: z.array(RuleCheckSchema),
  passCount: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Variant 3 — WorkflowRecording (Chrome recorder → Playwright e2e)
// ---------------------------------------------------------------------------

export const HardenedSelectorSchema = z.object({
  preferred: z.string(),
  strategy: z.enum(['testId', 'role', 'text', 'css']),
  fallbacks: z.array(z.string()),
});

export const ObservedStateSchema = z.object({
  description: z.string(),
  evidence: z.string(),
});

export const NetworkRequestSchema = z.object({
  t: z.number(),
  method: z.string(),
  url: z.string(),
});

/**
 * RecordedEvent — the leaves of the recorder's event trace. Discriminated by
 * `kind`. Captured deterministically; no LLM in the loop at this stage.
 */
export const RecordedEventSchema = z.discriminatedUnion('kind', [
  z.object({
    t: z.number(),
    kind: z.literal('click'),
    selector: HardenedSelectorSchema,
    targetText: z.string().optional(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal('input'),
    selector: HardenedSelectorSchema,
    value: z.string(),
    sensitive: z.boolean(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal('change'),
    selector: HardenedSelectorSchema,
    value: z.string(),
    /**
     * For `<select>` targets only: the full set of options the user had to
     * choose from at the moment of change. Renderers can use this to emit
     * `selectByLabel(...)` when label is more stable than value, and the M6
     * amplifier uses it to generate negative scenarios ("what if the user
     * picked X instead?"). Absent for checkbox/radio changes.
     */
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
        }),
      )
      .optional(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal('submit'),
    selector: HardenedSelectorSchema,
  }),
  z.object({
    t: z.number(),
    kind: z.literal('keydown'),
    key: z.string(),
    selector: HardenedSelectorSchema.optional(),
  }),
  z.object({
    t: z.number(),
    kind: z.literal('navigate'),
    url: z.string(),
    /**
     * What kind of navigation Chrome reported, so a renderer can decide
     * whether to emit `waitForURL` (cross-document), `waitForLoadState`
     * (reload), or just assert state after an SPA route change.
     *   - 'navigate' — cross-document load (link click, form submit, etc.)
     *   - 'reload'   — same URL, document refreshed
     *   - 'history'  — pushState / replaceState (SPA routing)
     *   - 'hash'     — fragment-only change
     */
    reason: z.enum(['navigate', 'reload', 'history', 'hash']),
  }),
  z.object({
    t: z.number(),
    kind: z.literal('assertObserved'),
    observation: ObservedStateSchema,
  }),
]);

export const WorkflowRecordingSchema = z.object({
  startedAt: z.string(),
  endedAt: z.string(),
  startUrl: z.string(),
  events: z.array(RecordedEventSchema),
  network: z.array(NetworkRequestSchema),
  framework: z.literal('playwright'),
});

// ---------------------------------------------------------------------------
// AmplifiedRecording — M6 IR between the LLM amplifier and the e2e renderer.
//
// Not a fourth Analysis variant. It's an intermediate the amplifier produces
// from a WorkflowRecording and the renderer consumes to emit Playwright
// `test()` blocks. User-facing artifacts stay WorkflowRecording (capture) and
// the rendered .spec.ts (output). See `docs/06-renderer.md` for the locked
// action and assertion sets that constrain this schema.
//
// v0.7.1 ships the schema + a deterministic renderer for it. The LLM call
// that *produces* an AmplifiedRecording from a WorkflowRecording lands in
// v0.7.2.
// ---------------------------------------------------------------------------

/**
 * Playwright actions an amplified scenario can emit. Kept at Playwright's
 * primitive level — already-translated from DOM events. Six base actions
 * (`click`, `fill`, `press`, `goto`, `reload`, `waitForURL`) plus three
 * implicit-but-distinct primitives derived from `change` events
 * (`selectOption`, `check`, `uncheck`).
 */
export const AmplifiedActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), selector: HardenedSelectorSchema }),
  z.object({ kind: z.literal('fill'), selector: HardenedSelectorSchema, value: z.string() }),
  z.object({ kind: z.literal('press'), selector: HardenedSelectorSchema, key: z.string() }),
  z.object({ kind: z.literal('goto'), url: z.string() }),
  z.object({ kind: z.literal('reload') }),
  z.object({ kind: z.literal('waitForURL'), url: z.string() }),
  z.object({
    kind: z.literal('selectOption'),
    selector: HardenedSelectorSchema,
    value: z.string(),
  }),
  z.object({ kind: z.literal('check'), selector: HardenedSelectorSchema }),
  z.object({ kind: z.literal('uncheck'), selector: HardenedSelectorSchema }),
]);

/**
 * Playwright assertions an amplified scenario can emit. Seven matchers locked
 * by v0.6.2: visible/hidden, text (equals or contains), url, count, value,
 * checked. Each maps cleanly to an `expect(...).toX()` call in the rendered
 * spec.
 */
export const AmplifiedAssertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('visible'), selector: HardenedSelectorSchema }),
  z.object({ kind: z.literal('hidden'), selector: HardenedSelectorSchema }),
  z.object({
    kind: z.literal('text'),
    selector: HardenedSelectorSchema,
    mode: z.enum(['equals', 'contains']),
    value: z.string(),
  }),
  z.object({ kind: z.literal('url'), value: z.string() }),
  z.object({
    kind: z.literal('count'),
    selector: HardenedSelectorSchema,
    value: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('value'),
    selector: HardenedSelectorSchema,
    value: z.string(),
  }),
  z.object({ kind: z.literal('checked'), selector: HardenedSelectorSchema }),
]);

/**
 * One scenario = one Playwright `test()` block. `kind: 'happy'` mirrors the
 * recorded user flow; `kind: 'negative'` is an LLM-generated variant (invalid
 * input, empty form, out-of-order action, etc.) that asserts the app handles
 * the failure mode informatively.
 *
 * Actions run first, then assertions. Mid-flow assertions aren't expressible
 * in v1 — most negative scenarios fit the "do actions, assert end state"
 * shape cleanly; if a real case needs interleaving, a future schema bump
 * adds a unified `steps[]` array.
 */
export const AmplifiedScenarioSchema = z.object({
  kind: z.enum(['happy', 'negative']),
  name: z.string().min(1),
  description: z.string().optional(),
  actions: z.array(AmplifiedActionSchema),
  assertions: z.array(AmplifiedAssertionSchema),
});

export const AmplifiedRecordingSchema = z.object({
  scenarios: z.array(AmplifiedScenarioSchema).min(1),
});

// ---------------------------------------------------------------------------
// The Analysis discriminated union
// ---------------------------------------------------------------------------

export const AnalysisSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('testPlan'),
    data: TestPlanSchema,
    meta: AnalysisMetaSchema,
  }),
  z.object({
    kind: z.literal('a11yReport'),
    data: A11yReportSchema,
    meta: AnalysisMetaSchema,
  }),
  z.object({
    kind: z.literal('workflowRecording'),
    data: WorkflowRecordingSchema,
    meta: AnalysisMetaSchema,
  }),
]);

// ---------------------------------------------------------------------------
// Inferred TS types — public API of this module
// ---------------------------------------------------------------------------

export type AnalysisMeta = z.infer<typeof AnalysisMetaSchema>;
export type SurfaceInput = z.infer<typeof SurfaceInputSchema>;
export type SurfaceOutput = z.infer<typeof SurfaceOutputSchema>;
export type SurfaceMethod = z.infer<typeof SurfaceMethodSchema>;
export type LifecycleHook = z.infer<typeof LifecycleHookSchema>;
export type InjectedDep = z.infer<typeof InjectedDepSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type A11yRuleTag = z.infer<typeof A11yRuleTagSchema>;
export type A11ySeverity = z.infer<typeof A11ySeveritySchema>;
export type A11yRuleStatus = z.infer<typeof A11yRuleStatusSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RuleCheck = z.infer<typeof RuleCheckSchema>;
export type A11yReport = z.infer<typeof A11yReportSchema>;
export type HardenedSelector = z.infer<typeof HardenedSelectorSchema>;
export type ObservedState = z.infer<typeof ObservedStateSchema>;
export type NetworkRequest = z.infer<typeof NetworkRequestSchema>;
export type RecordedEvent = z.infer<typeof RecordedEventSchema>;
export type WorkflowRecording = z.infer<typeof WorkflowRecordingSchema>;
export type AmplifiedAction = z.infer<typeof AmplifiedActionSchema>;
export type AmplifiedAssertion = z.infer<typeof AmplifiedAssertionSchema>;
export type AmplifiedScenario = z.infer<typeof AmplifiedScenarioSchema>;
export type AmplifiedRecording = z.infer<typeof AmplifiedRecordingSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Current contract artifact schema version. Bump when the IR changes shape. */
export const CURRENT_SCHEMA_VERSION = '1' as const;
