import { useEffect, useState } from 'react';
import {
  normalizeAxeResults,
  renderA11yReportMarkdown,
  renderPlaywrightSpec,
} from '@webspec/core/browser';
import type { A11yReport, WorkflowRecording } from '@webspec/core/browser';
import type {
  AuditRequest,
  AuditResponse,
  RecorderStartRequest,
  RecorderStartResponse,
  RecorderStatusRequest,
  RecorderStatusResponse,
  RecorderStopRequest,
  RecorderStopResponse,
} from '../shared/messages.js';
import { NamingForm } from './NamingForm.js';
import { ReportView } from './ReportView.js';
import { RecordingSummaryPanel } from './RecordingSummaryPanel.js';

type AuditStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'report'; report: A11yReport; storageKey: string };

type RecorderStatus =
  | { kind: 'idle' }
  | { kind: 'naming'; name: string; description: string }
  | { kind: 'starting'; name: string; description: string }
  | {
      kind: 'recording';
      startedAt: string;
      startUrl: string;
      name: string;
      description: string;
      tabId: number;
    }
  | { kind: 'stopping' }
  | { kind: 'error'; message: string }
  | { kind: 'review'; recording: WorkflowRecording }
  | { kind: 'saved'; filename: string; events: number }
  | { kind: 'discarded' };

export function App(): JSX.Element {
  const [audit, setAudit] = useState<AuditStatus>({ kind: 'idle' });
  const [recorder, setRecorder] = useState<RecorderStatus>({ kind: 'idle' });

  // Chrome popups are transient: every close-then-reopen mounts a fresh App
  // with `recorder: idle`, even though the content-script recorder may still
  // be running. Ask the content script for ground truth on mount.
  useEffect(() => {
    void hydrateRecorderStatus(setRecorder);
  }, []);

  const auditRunning = audit.kind === 'running';
  const recording = recorder.kind === 'recording';
  const recorderBusy =
    recorder.kind === 'naming' ||
    recorder.kind === 'starting' ||
    recorder.kind === 'stopping' ||
    recording;

  async function handleAuditClick(): Promise<void> {
    setAudit({ kind: 'running' });
    try {
      const report = await runAuditOnActiveTab();
      const storageKey = await stashReport(report);
      setAudit({ kind: 'report', report, storageKey });
    } catch (err) {
      setAudit({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleOpenReportClick(storageKey: string): Promise<void> {
    const url = chrome.runtime.getURL(`src/report/index.html?id=${encodeURIComponent(storageKey)}`);
    await chrome.tabs.create({ url });
  }

  function handleRecordToggle(): void {
    if (recorder.kind === 'recording') {
      void stopAndReviewRecording(
        recorder.tabId,
        recorder.startedAt,
        recorder.startUrl,
        recorder.name,
        recorder.description,
      );
      return;
    }
    if (recorder.kind === 'naming') {
      setRecorder({ kind: 'idle' });
      return;
    }
    setRecorder({ kind: 'naming', name: '', description: '' });
  }

  async function startRecording(name: string, description: string): Promise<void> {
    setRecorder({ kind: 'starting', name, description });
    try {
      const { tabId, url } = await activeHttpTab();
      const request: RecorderStartRequest = { type: 'recorder:start', name, description };
      const response = await chrome.tabs.sendMessage<RecorderStartRequest, RecorderStartResponse>(
        tabId,
        request,
      );
      if (!response.ok) throw new Error(response.error);
      setRecorder({
        kind: 'recording',
        startedAt: response.startedAt,
        startUrl: response.startUrl ?? url,
        name,
        description,
        tabId,
      });
    } catch (err) {
      setRecorder({
        kind: 'error',
        message: friendlyMessagingError(err),
      });
    }
  }

  async function stopAndReviewRecording(
    tabId: number,
    startedAt: string,
    startUrl: string,
    fallbackName: string,
    fallbackDescription: string,
  ): Promise<void> {
    setRecorder({ kind: 'stopping' });
    try {
      const request: RecorderStopRequest = { type: 'recorder:stop' };
      const response = await chrome.tabs.sendMessage<RecorderStopRequest, RecorderStopResponse>(
        tabId,
        request,
      );
      if (!response.ok) throw new Error(response.error);

      // Prefer the values echoed back by the content script (survives page
      // reload mid-recording); fall back to popup state for the same-popup case.
      const name = response.name || fallbackName;
      const description = response.description || fallbackDescription;

      const recording: WorkflowRecording = {
        name,
        description,
        startedAt,
        endedAt: response.endedAt,
        startUrl,
        events: response.events,
        network: [],
        framework: 'playwright',
      };

      setRecorder({ kind: 'review', recording });
    } catch (err) {
      setRecorder({
        kind: 'error',
        message: friendlyMessagingError(err),
      });
    }
  }

  async function handleDownloadRecording(recording: WorkflowRecording): Promise<void> {
    const base = `recording-${stamp(recording.startedAt)}`;
    try {
      const spec = renderPlaywrightSpec(recording);
      await downloadText(spec, `${base}.spec.ts`, 'text/plain');
      await downloadText(
        JSON.stringify(recording, null, 2),
        `${base}.json`,
        'application/json',
      );
      setRecorder({
        kind: 'saved',
        filename: `${base}.spec.ts`,
        events: recording.events.length,
      });
    } catch (err) {
      setRecorder({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleDiscardRecording(): void {
    setRecorder({ kind: 'discarded' });
  }

  return (
    <main className="popup">
      <header>
        <h1>webspec</h1>
        <p className="tagline">Shift-left companion for web app development.</p>
      </header>

      <div className="actions">
        <button
          type="button"
          onClick={handleAuditClick}
          disabled={auditRunning || recorderBusy}
        >
          {auditRunning ? 'Auditing…' : 'Audit this tab'}
        </button>
        <button
          type="button"
          onClick={handleRecordToggle}
          disabled={auditRunning || recorder.kind === 'starting' || recorder.kind === 'stopping'}
          className={recording ? 'recording-btn' : ''}
        >
          {recorder.kind === 'starting'
            ? 'Starting…'
            : recorder.kind === 'stopping'
              ? 'Saving…'
              : recording
                ? '■ Stop recording'
                : recorder.kind === 'naming'
                  ? 'Cancel'
                  : 'Record workflow'}
        </button>
      </div>

      {recorder.kind === 'naming' && (
        <NamingForm
          name={recorder.name}
          description={recorder.description}
          onChange={(name, description) =>
            setRecorder({ kind: 'naming', name, description })
          }
          onStart={(name, description) => void startRecording(name, description)}
        />
      )}

      {audit.kind === 'error' && (
        <p className="error" role="alert">
          {audit.message}
        </p>
      )}

      {recorder.kind === 'error' && (
        <p className="error" role="alert">
          {recorder.message}
        </p>
      )}

      {recorder.kind === 'recording' && (
        <p className="recorder-banner" role="status">
          Recording <strong>{recorder.name}</strong> — click anywhere in the page to capture
          events. Stop when done.
        </p>
      )}

      {recorder.kind === 'review' && (
        <RecordingSummaryPanel
          recording={recorder.recording}
          onDownload={() => handleDownloadRecording(recorder.recording)}
          onDiscard={handleDiscardRecording}
        />
      )}

      {recorder.kind === 'saved' && (
        <p className="recorder-success" role="status">
          Saved <code>{recorder.filename}</code> ({recorder.events}{' '}
          event{recorder.events === 1 ? '' : 's'}).
        </p>
      )}

      {recorder.kind === 'discarded' && (
        <p className="recorder-banner" role="status">
          Recording discarded — nothing saved.
        </p>
      )}

      {audit.kind === 'report' && (
        <ReportView
          report={audit.report}
          onCopy={() => copyToClipboard(renderA11yReportMarkdown(audit.report))}
          onOpenFullReport={() => handleOpenReportClick(audit.storageKey)}
        />
      )}

      <footer>
        <p className="meta">v1.1.0 — named test case recording</p>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Active tab helpers
// ---------------------------------------------------------------------------

/**
 * Ask the active tab's content script whether a recording is already in
 * progress, and hydrate React state from the answer. Best-effort — if the
 * tab isn't http(s), or the content script hasn't loaded yet (no Receiving
 * end), we silently stay in `idle`. The user will see a friendly messaging
 * error when they next try to start/stop a recording on such a tab anyway.
 */
async function hydrateRecorderStatus(
  setRecorder: (status: RecorderStatus) => void,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return;
    const request: RecorderStatusRequest = { type: 'recorder:status' };
    const response = await chrome.tabs.sendMessage<RecorderStatusRequest, RecorderStatusResponse>(
      tab.id,
      request,
    );
    if (response.ok && response.recording) {
      setRecorder({
        kind: 'recording',
        startedAt: response.startedAt,
        startUrl: response.startUrl,
        name: response.name,
        description: response.description,
        tabId: tab.id,
      });
    }
  } catch {
    // Content script not loaded or messaging blocked; stay idle.
  }
}

async function activeHttpTab(): Promise<{ tabId: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error(
      'webspec only works on http(s) pages. Navigate to a regular web page and try again.',
    );
  }
  return { tabId: tab.id, url: tab.url };
}

function friendlyMessagingError(err: unknown): string {
  if (err instanceof Error && /Receiving end does not exist/.test(err.message)) {
    return 'Content script not loaded yet — reload the page and try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Audit flow (unchanged)
// ---------------------------------------------------------------------------

async function runAuditOnActiveTab(): Promise<A11yReport> {
  const { tabId, url } = await activeHttpTab();
  const request: AuditRequest = { type: 'audit:request' };
  let response: AuditResponse;
  try {
    response = await chrome.tabs.sendMessage<AuditRequest, AuditResponse>(tabId, request);
  } catch (err) {
    throw new Error(friendlyMessagingError(err));
  }
  if (!response.ok) throw new Error(response.error);
  return normalizeAxeResults(response.results, { kind: 'url', ref: url });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stash the report under a unique key in `chrome.storage.local` so the report
 * tab can read it back. Wraps the report with `scannedAt` so the design can
 * render a real timestamp — `A11yReport` itself doesn't carry one (that lives
 * on `Analysis.meta.createdAt`, but the popup skips the Analysis envelope).
 */
async function stashReport(report: A11yReport): Promise<string> {
  const key = `report:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const stashed: StashedReport = {
    scannedAt: new Date().toISOString(),
    report,
  };
  await chrome.storage.local.set({ [key]: stashed });
  return key;
}

export interface StashedReport {
  scannedAt: string;
  report: A11yReport;
}

// ---------------------------------------------------------------------------
// Recording download — chrome.downloads API + blob URL.
// ---------------------------------------------------------------------------

async function downloadText(content: string, filename: string, mimeType: string): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    // Revoke after the download completes — Chrome reads the blob URL on its
    // own thread, so a small delay avoids racing.
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function stamp(iso: string): string {
  // 2026-05-11T10:30:45.123Z → 2026-05-11_10-30-45
  return iso.slice(0, 19).replace('T', '_').replace(/:/g, '-');
}
