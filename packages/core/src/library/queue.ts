/**
 * Queue — ordered composition of Test Cases for v1.4 Team Shareability.
 *
 * A Queue is the authored unit that ships to the team repo as
 * `<repo>/tests/queue-<n>-<slug>.json` (this manifest, source of truth) plus
 * `<repo>/tests/queue-<n>-<slug>.spec.ts` (the regenerable Playwright output).
 * The MVP inlines each Test Case body into the rendered spec; reuse lands in
 * v1.5+. See `docs/10-team-shareability.md`.
 *
 * `steps[].testCase` is the slug of a Test Case saved under
 * `<repo>/test-cases/<slug>/`. `runAs` is the raw user identity (no role
 * registry in v1.4 — `${runAs}` substitution through the matching AuthProfile
 * is what turns it into real headers). `iterations` defaults to 1 and is
 * intended for bulk-seed flows (e.g. iterations: 100).
 */
import { z } from 'zod';

export const QUEUE_SCHEMA_VERSION = 1;

/**
 * v1.6 — value source for a parametric Test Case input on a Queue step.
 *   - 'constant'  : a literal string supplied at compose time.
 *   - 'output'    : the named output of an earlier non-iterated step in the
 *                   same Queue. `step` is 1-based and must reference a prior
 *                   step (`step < currentStep`) whose Test Case declares the
 *                   given `outputName`. The composer is responsible for that
 *                   cross-step validation — the schema only enforces local
 *                   shape (step is a positive integer, outputName is non-empty).
 */
export const QueueStepInputValueSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('constant'), value: z.string() }),
  z.object({
    mode: z.literal('output'),
    step: z.number().int().positive(),
    outputName: z.string().min(1),
  }),
]);

export const QueueStepSchema = z.object({
  testCase: z.string().min(1),
  runAs: z.string(),
  iterations: z.number().int().positive().optional(),
  /**
   * v1.6 — wiring for the referenced Test Case's declared inputs. Keys are
   * input names (from `WorkflowRecording.inputs[].name`); each value is
   * either a literal constant or a reference to an earlier step's output.
   * Optional; absent or `{}` means the step's Test Case declares no inputs
   * (or the user hasn't wired them yet — composer-side error).
   */
  inputValues: z.record(z.string(), QueueStepInputValueSchema).optional(),
});

export const QueueInputSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

export const QueueSchema = z.object({
  schemaVersion: z.literal(QUEUE_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  steps: z.array(QueueStepSchema).min(1),
  inputs: z.array(QueueInputSchema).default([]),
});

export const QueueListSchema = z.array(QueueSchema);

export type QueueStep = z.infer<typeof QueueStepSchema>;
export type QueueStepInputValue = z.infer<typeof QueueStepInputValueSchema>;
export type QueueInput = z.infer<typeof QueueInputSchema>;
export type Queue = z.infer<typeof QueueSchema>;
export type QueueList = z.infer<typeof QueueListSchema>;

/**
 * On-disk filename for a Queue manifest under `<repo>/tests/`. `n` is the
 * 1-based position used to keep manifests ordered in the directory listing
 * (and matched 1:1 with the rendered `.spec.ts`).
 */
export function queueManifestFilename(n: number, slug: string): string {
  return `queue-${n}-${slug}.json`;
}

export function queueSpecFilename(n: number, slug: string): string {
  return `queue-${n}-${slug}.spec.ts`;
}
