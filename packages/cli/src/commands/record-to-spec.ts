/**
 * `webspec record-to-spec <recording.json>` — render a captured workflow into
 * a Playwright `.spec.ts`.
 *
 * v0.7.0: deterministic pass only. Reads the JSON, validates it against
 * `WorkflowRecordingSchema`, calls `renderPlaywrightSpec`, writes the output
 * next to the input (or to `--out`). LLM amplification (negative scenarios)
 * lands in v0.7.2.
 *
 * Validation failure → exit code 2 with a clear message (caller fault: bad
 * input file). Any other thrown error → exit code 1 (runtime fault).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { renderPlaywrightSpec, WorkflowRecordingSchema } from '@webspec/core';
import type { WorkflowRecording } from '@webspec/core';
import type { RecordToSpecCommand } from '../args.js';

export interface RecordToSpecResult {
  /** Path the rendered spec was written to. */
  outputPath: string;
  /** Number of events in the source recording — surfaced in the stderr log. */
  eventCount: number;
}

export async function runRecordToSpec(cmd: RecordToSpecCommand): Promise<RecordToSpecResult> {
  const raw = await readFile(cmd.input, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RecordToSpecInputError(`${cmd.input}: not valid JSON (${msg})`);
  }

  const result = WorkflowRecordingSchema.safeParse(parsed);
  if (!result.success) {
    throw new RecordToSpecInputError(
      `${cmd.input}: not a valid WorkflowRecording — ${result.error.message}`,
    );
  }

  const recording: WorkflowRecording = result.data;
  const spec = renderPlaywrightSpec(recording, cmd.testName !== undefined ? { testName: cmd.testName } : {});

  const outputPath = cmd.out ?? defaultOutputPath(cmd.input);
  await writeFile(outputPath, spec, 'utf8');

  return { outputPath, eventCount: recording.events.length };
}

/**
 * Caller-side error (bad input file). The shell shim should exit code 2.
 * Runtime errors (FS, permissions) bubble as-is for exit code 1.
 */
export class RecordToSpecInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordToSpecInputError';
  }
}

/**
 * Mirror the build plan: write `recording.spec.ts` next to the source. We
 * append `.spec.ts` to whatever stem the user gave us, replacing a trailing
 * `.json` if present — so `recording.json` becomes `recording.spec.ts` rather
 * than `recording.json.spec.ts`.
 */
function defaultOutputPath(input: string): string {
  if (input.toLowerCase().endsWith('.json')) {
    return `${input.slice(0, -'.json'.length)}.spec.ts`;
  }
  return `${input}.spec.ts`;
}
