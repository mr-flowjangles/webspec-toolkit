/**
 * Summary computation for the post-stop preview panel (v0.5.4).
 *
 * Pure functions, popup-local — the renderer at M6 needs its own different
 * summary view, so we don't promote this to `@webspec/core` yet.
 */
import type { WorkflowRecording } from '@webspec/core/browser';

export interface RecordingSummary {
  /** Wall-clock duration of the recording, in milliseconds. */
  durationMs: number;
  /** Total number of recorded events. */
  eventCount: number;
  /** Count per `kind` — keys present only when count > 0, so render order is stable. */
  countsByKind: Record<string, number>;
  /** URL trail — startUrl first, then a stop per navigate event in t-order. */
  urlTrail: UrlTrailEntry[];
  /**
   * Hint for the share-warning copy. True when at least one non-password
   * input event captured a non-empty value. (Password values are masked
   * to `''` with `sensitive: true` at capture time.)
   */
  hasUserInput: boolean;
}

export interface UrlTrailEntry {
  url: string;
  reason: 'start' | 'navigate' | 'reload' | 'history' | 'hash';
}

export function summarizeRecording(recording: WorkflowRecording): RecordingSummary {
  const start = Date.parse(recording.startedAt);
  const end = Date.parse(recording.endedAt);
  const durationMs = Number.isFinite(end - start) ? end - start : 0;

  const countsByKind: Record<string, number> = {};
  const urlTrail: UrlTrailEntry[] = [{ url: recording.startUrl, reason: 'start' }];
  let hasUserInput = false;

  for (const event of recording.events) {
    countsByKind[event.kind] = (countsByKind[event.kind] ?? 0) + 1;
    if (event.kind === 'navigate') {
      urlTrail.push({ url: event.url, reason: event.reason });
    }
    if (event.kind === 'input' && !event.sensitive && event.value !== '') {
      hasUserInput = true;
    }
  }

  return {
    durationMs,
    eventCount: recording.events.length,
    countsByKind,
    urlTrail,
    hasUserInput,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}m ${remainder.toFixed(0)}s`;
}
