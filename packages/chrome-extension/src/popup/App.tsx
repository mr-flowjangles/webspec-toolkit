import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  deriveSlug,
  matchProfile,
  normalizeAxeResults,
  renderA11yReportMarkdown,
  renderTestCaseModule,
  renderTestCaseSpec,
  resolveProfileHeaders,
} from '@webspec/core/browser';
import type {
  A11yReport,
  AuthProfile,
  RecordingInput,
  RecordingOutput,
  WorkflowRecording,
} from '@webspec/core/browser';
import { attachIOToRecording } from './io-authoring.js';
import {
  isRecorderOverlayStopRequest,
  type AuditRequest,
  type AuditResponse,
  type RecorderStartRequest,
  type RecorderStartResponse,
  type RecorderStatusRequest,
  type RecorderStatusResponse,
  type RecorderStopRequest,
  type RecorderStopResponse,
} from '../shared/messages.js';
import { loadProfiles } from '../shared/profiles.js';
import {
  checkRepoPermission,
  loadRepoFolderHandle,
  requestRepoPermission,
  writeFileToRepoFolder,
} from '../shared/repoFolder.js';
import { ensureBootstrap } from '../shared/bootstrap.js';
import { NamingForm } from './NamingForm.js';
import { ReportView } from './ReportView.js';
import { RecordingSummaryPanel } from './RecordingSummaryPanel.js';
import { SettingsPage } from '../settings/SettingsPage.js';
import '../settings/settings.css';

type SaveLocation = { kind: 'downloads' } | { kind: 'repo'; folderName: string };

type AuditStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'report'; report: A11yReport; storageKey: string };

type RecorderStatus =
  | { kind: 'idle' }
  | {
      kind: 'naming';
      name: string;
      description: string;
      runAs: string;
      matchedProfile: AuthProfile | null;
    }
  | {
      kind: 'starting';
      name: string;
      description: string;
      runAs: string;
      matchedProfile: AuthProfile | null;
    }
  | {
      kind: 'recording';
      startedAt: string;
      startUrl: string;
      name: string;
      description: string;
      runAs: string;
      matchedProfile: AuthProfile | null;
      tabId: number;
    }
  | { kind: 'stopping' }
  | { kind: 'error'; message: string }
  | { kind: 'review'; recording: WorkflowRecording }
  | { kind: 'saved'; slug: string; events: number; location: SaveLocation }
  | { kind: 'discarded' };

export function App(): JSX.Element {
  const [audit, setAudit] = useState<AuditStatus>({ kind: 'idle' });
  const [recorder, setRecorder] = useState<RecorderStatus>({ kind: 'idle' });
  // v1.7.9 — the side panel is the single surface: Settings (auth profiles,
  // queues, general) renders in-panel as a sub-view rather than opening a
  // separate browser tab.
  const [view, setView] = useState<'main' | 'settings'>('main');

  // Chrome popups are transient: every close-then-reopen mounts a fresh App
  // with `recorder: idle`, even though the content-script recorder may still
  // be running. Ask the content script for ground truth on mount.
  useEffect(() => {
    void hydrateRecorderStatus(setRecorder);
  }, []);

  // v1.7.6 — the side panel persists for the lifetime of its window, so
  // *any* state captured at mount time can outlive the situation that
  // produced it. Clearing errors on mount alone isn't enough — the panel
  // mounted once, hours ago. So we ALSO actively re-check active-tab
  // status whenever a tab event fires (see useEffect below) and clear
  // any stale error if the current tab is actually http(s) now.
  useEffect(() => {
    void clearErrorIfTabIsHttp(setRecorder, setAudit);
  }, []);

  // v1.7.5 — the side panel persists across tab switches inside a window,
  // so an "only works on http(s) pages" error stuck around even after the
  // user navigated to a real page. Clear the recorder/audit error state
  // whenever the active tab changes or its URL updates. Idle/recording/
  // review/etc. are preserved.
  useEffect(() => {
    const onActivated = (): void => {
      void clearErrorIfTabIsHttp(setRecorder, setAudit);
    };
    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ): void => {
      if (changeInfo.url !== undefined) {
        void clearErrorIfTabIsHttp(setRecorder, setAudit);
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  // v1.7.8 — the on-page floating overlay's Stop button broadcasts a
  // `recorder:overlay-stop` runtime message. When the side panel is open (the
  // v1.7 premise: it stays open during recording), run the same stop→review
  // flow the panel's own Stop button uses. Re-registered on each recorder
  // change so the listener closes over the current recording fields.
  useEffect(() => {
    const onMessage = (message: unknown): void => {
      if (isRecorderOverlayStopRequest(message) && recorder.kind === 'recording') {
        void stopAndReviewRecording(
          recorder.tabId,
          recorder.startedAt,
          recorder.startUrl,
          recorder.name,
          recorder.description,
          recorder.runAs,
          recorder.matchedProfile,
        );
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [recorder]);

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

  async function handleRecordToggle(): Promise<void> {
    if (recorder.kind === 'recording') {
      void stopAndReviewRecording(
        recorder.tabId,
        recorder.startedAt,
        recorder.startUrl,
        recorder.name,
        recorder.description,
        recorder.runAs,
        recorder.matchedProfile,
      );
      return;
    }
    if (recorder.kind === 'naming') {
      setRecorder({ kind: 'idle' });
      return;
    }
    // Idle → naming: match the active tab against configured auth profiles
    // so the form can show which profile (if any) will apply.
    const matched = await getMatchedProfileForActiveTab();
    setRecorder({
      kind: 'naming',
      name: '',
      description: '',
      runAs: '',
      matchedProfile: matched,
    });
  }

  async function startRecording(
    name: string,
    description: string,
    runAs: string,
    matchedProfile: AuthProfile | null,
  ): Promise<void> {
    setRecorder({ kind: 'starting', name, description, runAs, matchedProfile });
    try {
      const { tabId, url } = await activeHttpTab();
      const request: RecorderStartRequest = {
        type: 'recorder:start',
        name,
        description,
        runAs,
      };
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
        runAs,
        matchedProfile,
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
    fallbackRunAs: string,
    matchedProfile: AuthProfile | null,
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
      const rawRunAs = response.runAs ?? fallbackRunAs;
      // Normalize the optional field: empty string → null on the recording so
      // downstream consumers (renderer, future test report) can short-circuit
      // on a single nullish check.
      const runAs = rawRunAs.trim() === '' ? null : rawRunAs.trim();
      // Resolve the matched auth profile against runAs at this stop moment.
      // We do it here (not at save) so that re-entering review doesn't have
      // to re-resolve, and so the WorkflowRecording is fully self-contained
      // when handed to RecordingSummaryPanel / the renderer.
      const auth =
        matchedProfile === null
          ? null
          : {
              profileName: matchedProfile.name,
              headers: resolveProfileHeaders(matchedProfile, runAs ?? ''),
            };

      const recording: WorkflowRecording = {
        name,
        description,
        runAs,
        auth,
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

  async function handleSaveRecording(
    rawRecording: WorkflowRecording,
    inputs: RecordingInput[],
    outputs: RecordingOutput[],
  ): Promise<void> {
    // v1.6.2 — attach the Save-panel-authored Inputs/Outputs to the recording
    // before serialization. The Save UI has already validated them; the
    // helper module renderer + queue composer will read these in v1.6.3+.
    const recording = attachIOToRecording(rawRecording, inputs, outputs);
    const slug = deriveSlug(recording.name);
    if (slug === '') {
      setRecorder({
        kind: 'error',
        message:
          'Cannot derive a folder name from the test name. Use letters or digits.',
      });
      return;
    }
    try {
      // v1.5.0: each Test Case ships as TWO TS files. `recording.ts` is the
      // importable helper module (exports `run({ page, context })`) — Queues
      // consume it, the standalone spec consumes it. `recording.spec.ts` is
      // the thin wrapper that calls run() inside one test() so the Test Case
      // stays standalone-runnable.
      const helperModule = renderTestCaseModule(recording);
      const spec = renderTestCaseSpec(recording);
      const recordingJson = JSON.stringify(recording, null, 2);

      // v1.3.4: prefer the configured Test repo folder if available.
      const repoResult = await trySaveToRepo(slug, helperModule, spec, recordingJson);
      if (repoResult.kind === 'wrote') {
        setRecorder({
          kind: 'saved',
          slug,
          events: recording.events.length,
          location: { kind: 'repo', folderName: repoResult.folderName },
        });
        return;
      }

      // Fallback: v1.2 Downloads flow. Per-test files overwrite (canonical
      // slug); parent playwright.config.ts is write-once via search history.
      const dir = `webspec/${slug}`;
      await writeToWebspec(`${dir}/recording.ts`, helperModule, 'application/octet-stream');
      await writeToWebspec(`${dir}/recording.spec.ts`, spec, 'application/octet-stream');
      await writeToWebspec(`${dir}/recording.json`, recordingJson, 'application/json');
      await writeToWebspec(
        `${dir}/playwright.config.ts`,
        PER_TEST_PLAYWRIGHT_CONFIG,
        'application/octet-stream',
      );
      await ensureParentPlaywrightConfig();

      setRecorder({
        kind: 'saved',
        slug,
        events: recording.events.length,
        location: { kind: 'downloads' },
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

  if (view === 'settings') {
    return <SettingsPage onBack={() => setView('main')} />;
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
          onClick={() => void handleRecordToggle()}
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
        <button
          type="button"
          className="settings-btn"
          onClick={() => setView('settings')}
          disabled={auditRunning || recorderBusy}
          aria-label="Open settings"
          title="Settings — auth profiles, queues"
        >
          ⚙
        </button>
      </div>

      {recorder.kind === 'naming' && (
        <NamingForm
          name={recorder.name}
          description={recorder.description}
          runAs={recorder.runAs}
          matchedProfile={recorder.matchedProfile}
          onChange={(name, description, runAs) =>
            setRecorder({
              kind: 'naming',
              name,
              description,
              runAs,
              matchedProfile: recorder.matchedProfile,
            })
          }
          onStart={(name, description, runAs) =>
            void startRecording(name, description, runAs, recorder.matchedProfile)
          }
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
          onSave={(inputs, outputs) =>
            handleSaveRecording(recorder.recording, inputs, outputs)
          }
          onDiscard={handleDiscardRecording}
        />
      )}

      {recorder.kind === 'saved' && (
        <p className="recorder-success" role="status">
          {recorder.location.kind === 'repo' ? (
            <>
              Saved to <code>{recorder.location.folderName}/test-cases/{recorder.slug}/</code>{' '}
              ({recorder.events} event{recorder.events === 1 ? '' : 's'}). Run Playwright from
              your repo.
            </>
          ) : (
            <>
              Saved to <code>~/Downloads/webspec/{recorder.slug}/</code> ({recorder.events}{' '}
              event{recorder.events === 1 ? '' : 's'}). Run <code>make run-tests</code> to
              open Playwright UI.
            </>
          )}
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
        <p className="meta">v1.7.9 — side panel single surface</p>
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
      // Re-match the auth profile against the recording's start URL (not the
      // current tab URL, which may have changed during the recording). v1.3
      // doesn't persist the matched profile across content-script restarts —
      // we accept the small risk that a profile edited mid-recording could
      // shift the match. Document in 08-test-library.md (open question 2).
      const profiles = await loadProfiles();
      const matchedProfile = matchProfile(profiles, response.startUrl);
      setRecorder({
        kind: 'recording',
        startedAt: response.startedAt,
        startUrl: response.startUrl,
        name: response.name,
        description: response.description,
        runAs: response.runAs,
        matchedProfile,
        tabId: tab.id,
      });
    }
  } catch {
    // Content script not loaded or messaging blocked; stay idle.
  }
}

/**
 * Best-effort: read the active tab's URL, load configured auth profiles
 * from chrome.storage.local, and return the matching profile (or null).
 * Used at recording-start so the naming form can show which profile will
 * apply. Failures (no active tab, non-http URL, storage error) all
 * resolve to null — the user records without auth.
 */
async function getMatchedProfileForActiveTab(): Promise<AuthProfile | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/i.test(tab.url)) return null;
    const profiles = await loadProfiles();
    return matchProfile(profiles, tab.url);
  } catch {
    return null;
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

/**
 * v1.7.6 — proactive check used by the side-panel mount effect and the
 * tab-change listener. If the active tab is currently http(s), forcibly
 * drop any stale `error` state on recorder/audit back to `idle`. Safe to
 * call any time — bails silently if anything goes wrong.
 */
async function clearErrorIfTabIsHttp(
  setRecorder: Dispatch<SetStateAction<RecorderStatus>>,
  setAudit: Dispatch<SetStateAction<AuditStatus>>,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/i.test(tab.url)) return;
    setRecorder((prev) => (prev.kind === 'error' ? { kind: 'idle' } : prev));
    setAudit((prev) => (prev.kind === 'error' ? { kind: 'idle' } : prev));
  } catch {
    // ignore — best-effort
  }
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
// Save flow — chrome.downloads API writes into ~/Downloads/webspec/<slug>/
// per the v1.2 test-library design (docs/08-test-library.md).
// ---------------------------------------------------------------------------

const PER_TEST_PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  reporter: 'line',
  use: { headless: false },
});
`;

const PARENT_PLAYWRIGHT_CONFIG = `// webspec test-library parent config — discovers every recording.spec.ts
// under ~/Downloads/webspec/<slug>/. Written by the extension on first save
// and never overwritten — feel free to customize.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/recording.spec.ts',
  reporter: 'line',
  use: { headless: false },
});
`;

/**
 * Save a Test Case to the user's configured Test repo folder (v1.3.4+).
 *
 * Resolves to:
 *   - `{ kind: 'wrote', folderName }` — files written to `<repo>/test-cases/<slug>/`.
 *   - `{ kind: 'no-handle' }` — user hasn't configured a folder; caller falls back to Downloads.
 *   - `{ kind: 'denied' }` — folder is set but Chrome refused readwrite. Caller falls
 *     back to Downloads; the Settings → General page can re-grant.
 *
 * Permission re-request is allowed here because the Save click is a user
 * gesture — Chrome lets us call `requestPermission` mid-handler.
 */
async function trySaveToRepo(
  slug: string,
  helperModule: string,
  spec: string,
  recordingJson: string,
): Promise<{ kind: 'wrote'; folderName: string } | { kind: 'no-handle' } | { kind: 'denied' }> {
  const handle = await loadRepoFolderHandle();
  if (handle === null) return { kind: 'no-handle' };

  let perm = await checkRepoPermission(handle);
  if (perm === 'prompt') {
    perm = await requestRepoPermission(handle);
  }
  if (perm !== 'granted') return { kind: 'denied' };

  // v1.4.2: on the first save into a fresh repo, scaffold the four bootstrap
  // files (package.json, playwright.config.ts, .gitignore, README.md) so a
  // teammate can clone + `npm install` + `npm test` without further setup.
  // The confirm guard exists because we're writing files the user didn't
  // explicitly ask for — see docs/10-team-shareability.md.
  await ensureBootstrap(handle, {
    confirm: async () =>
      confirm(
        `webspec wants to scaffold a Playwright project in "${handle.name}" so your team can run the tests.\n\n` +
          `It will create: package.json, playwright.config.ts, .gitignore, README.md, and .github/workflows/playwright.yml.\n\n` +
          `Continue?`,
      ),
  });

  // v1.5.0: write the helper module (recording.ts) alongside the thin spec
  // wrapper. Queues import the helper; the spec wraps it for standalone
  // runs. The per-test playwright.config.ts keeps the Test Case runnable in
  // isolation; the repo-root config (from v1.4.2 bootstrap) is what teams
  // actually run.
  const dir = `test-cases/${slug}`;
  await writeFileToRepoFolder(handle, `${dir}/recording.ts`, helperModule);
  await writeFileToRepoFolder(handle, `${dir}/recording.spec.ts`, spec);
  await writeFileToRepoFolder(handle, `${dir}/recording.json`, recordingJson);
  await writeFileToRepoFolder(handle, `${dir}/playwright.config.ts`, PER_TEST_PLAYWRIGHT_CONFIG);

  return { kind: 'wrote', folderName: handle.name };
}

/**
 * Write a file under ~/Downloads/<relative-path> with explicit overwrite.
 * Per-test files (recording.spec.ts, recording.json, per-test config) all
 * use this — the user named the same slug, this is their canonical place.
 */
async function writeToWebspec(
  relativePath: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: relativePath,
      conflictAction: 'overwrite',
      saveAs: false,
    });
  } finally {
    // Revoke after the download completes — Chrome reads the blob URL on its
    // own thread, so a small delay avoids racing.
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }
}

/**
 * Ensure ~/Downloads/webspec/playwright.config.ts exists. Write-once: if a
 * previous Save from this extension wrote it (per chrome.downloads.search
 * history), skip — the user may have customized it. Best-effort.
 */
async function ensureParentPlaywrightConfig(): Promise<void> {
  try {
    const prior = await chrome.downloads.search({
      query: ['webspec/playwright.config.ts'],
      limit: 1,
    });
    const alreadyWritten = prior.some((d) =>
      d.filename.endsWith(`webspec/playwright.config.ts`) ||
      d.filename.endsWith(`webspec\\playwright.config.ts`),
    );
    if (alreadyWritten) return;
  } catch {
    // search failure → fall through to a uniquify write; an orphan suffix
    // file is the worst case and is recoverable by hand.
  }
  const blob = new Blob([PARENT_PLAYWRIGHT_CONFIG], { type: 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: 'webspec/playwright.config.ts',
      conflictAction: 'uniquify',
      saveAs: false,
    });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }
}
