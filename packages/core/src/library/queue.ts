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

export const QueueStepSchema = z.object({
  testCase: z.string().min(1),
  runAs: z.string(),
  iterations: z.number().int().positive().optional(),
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
