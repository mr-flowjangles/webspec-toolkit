# webspec

A browser-based shift-left companion for web app development. The Chrome extension records a user's workflow, audits the page for Section 508 / WCAG issues, and renders the recording into a runnable Playwright spec with positive AND negative scenarios (LLM-amplified). Short feedback loops — catch problems while you're building, not after.

## Status

🚀 **webspec v1 shipped at `v1.0.0` on 2026-05-14.** Chrome extension (audit + record modes), thin CLI (`webspec audit` + `webspec record-to-spec`), LLM-amplified Playwright renderer, and three-site live verification — all green against the v1 Definition of Done. Read the full release announcement in [`Versions/v1/v1.0/release-notes.md`](Versions/v1/v1.0/release-notes.md). Post-v1 work continues against the milestone backlog in `docs/07-build-plan.md`.

## Quickstart

End-to-end walkthrough for a new operator: install the Chrome extension, audit a page, record a workflow, render a Playwright spec, run it.

### 1. Build the toolkit

```sh
git clone https://github.com/mr-flowjangles/webspec-toolkit.git
cd webspec-toolkit
nvm use            # Node 20 (see .nvmrc)
pnpm install
pnpm -w build      # builds core, cli, and chrome-extension
```

### 2. Install the Chrome extension

1. Open `chrome://extensions/`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked** and select `packages/chrome-extension/dist/`
4. The webspec icon appears in your toolbar; pin it for quicker access

### 3. Audit a page

Two surfaces, identical findings — pick whichever fits your loop.

**In the browser** (no terminal): navigate to any page → click the webspec icon → **Audit this tab**. The popup renders severity-grouped findings with selectors and fix hints. **Copy report** drops a Markdown version on your clipboard.

**From the CLI** (for CI gating):

```sh
node packages/cli/dist/index.js audit https://example.com
# or write to a file:
node packages/cli/dist/index.js audit https://example.com --format md --out audit.md
```

Both surfaces use the same axe-core rule set (`wcag21aa` + `section508` + `best-practice` tags).

### 4. Record a workflow

1. Navigate to the page you want to test
2. Click the webspec icon → **Record workflow**
3. Name the test case, describe what it should prove (both required), and optionally set **Run as user** (functional in v1.3 — captured now so you don't have to re-record) → **Start recording**
4. Walk through the flow (clicks, typing, form submits, checkboxes, selects, key presses are all captured; passwords are masked automatically; recording state survives popup close and page reloads)
5. When done, open the popup → **Stop**
6. Review the trace summary, then **Save** — the extension writes the test into the on-disk library at `~/Downloads/webspec/<slug>/`:
   - `recording.spec.ts` (the rendered Playwright spec, ready to run)
   - `recording.json` (the raw `WorkflowRecording`, for re-rendering later)
   - `playwright.config.ts` (per-test config so the folder is runnable on its own)
   - On the first save, a parent `~/Downloads/webspec/playwright.config.ts` is also created — that's what Playwright UI uses to discover every saved test

### 5. Open the test library in Playwright UI

```sh
# First time only: install Chromium for Playwright.
pnpm --filter @webspec/cli exec playwright install chromium

# Open the library:
make run-tests
```

`make run-tests` opens Playwright UI against `~/Downloads/webspec/playwright.config.ts`. The left panel lists every saved test by slug; click ▶ on any one to run it (or the top-level ▶ to run them all). Run history, traces, time-travel debugger, watch mode are all built in.

For headless one-shot runs (CI):

```sh
make run-tests-ci
```

### 6. Re-render with LLM amplification (optional)

`recording.json` is the seed for a richer spec. Feed it back through the CLI to add negative scenarios (invalid input, empty fields, error states — emitted as additional `test()` blocks alongside the happy path):

```sh
# Re-render deterministically (no LLM):
node packages/cli/dist/index.js record-to-spec ~/Downloads/webspec/<slug>/recording.json

# Amplified — requires AWS credentials for Bedrock:
node packages/cli/dist/index.js record-to-spec ~/Downloads/webspec/<slug>/recording.json --provider bedrock
```

The renderer uses `getByRole` selectors with the hardened forms captured at record time, so the spec is robust to typical DOM churn.

Three reference recordings ship under `tests/fixtures/recordings/three-sites/` — `example.com`, `react.dev`, `demo.playwright.dev/todomvc/`. Re-render and re-run any of them as a live-site smoke test (rendered specs land under `.tmp/`, which is gitignored):

```sh
mkdir -p tests/fixtures/recordings/three-sites/.tmp
node packages/cli/dist/index.js record-to-spec \
  tests/fixtures/recordings/three-sites/todomvc.recording.json \
  --out tests/fixtures/recordings/three-sites/.tmp/todomvc.spec.ts
make run-spec SPEC=tests/fixtures/recordings/three-sites/.tmp/todomvc.spec.ts
```

(For integration into your own app's existing Playwright suite, copy the rendered `.spec.ts` into your `tests/` directory and run it under your own runner — the spec only imports from `@playwright/test`.)

## Develop

For contributors working on webspec itself:

```sh
nvm use            # Node 20 (see .nvmrc)
make setup         # pnpm install
make ci            # lint + test
make build         # tsc -b across the workspace
make image && make smoke   # Docker CLI image + --help smoke test
```

## Where to start

1. **`CLAUDE.md`** — repo-level context and working norms.
2. **`docs/00-overview.md`** — what we're building and why, plus the reading order for the rest of `docs/`.
3. **`docs/07-build-plan.md`** — milestones, ordered tasks, checkboxes. The action doc.

## Repo layout

```
.
├── CLAUDE.md                 # repo context for Claude sessions
├── README.md                 # this file
├── Makefile                  # `make help` for available targets
├── Dockerfile                # ship target
├── docs/                     # design + build plan
├── packages/                 # monorepo: core, cli, chrome-extension, vscode-extension (post-v1), config
├── scripts/                  # ceremony scripts (versioning, vendor fetch, etc.)
├── tests/fixtures/           # shared test inputs (playwright-target, recordings)
├── infra/terraform/          # AWS deployment (defined when deployment is real)
└── Versions/                 # release notes, one stacked file per minor
```

## Working norms

- Design before code. If implementation surfaces a question the docs didn't answer, stop and update the relevant doc (or `docs/99-open-questions.md`) before resuming.
- The build plan is authoritative. Tick milestones as they land; don't start the next milestone until the previous one's "Done when" is true.
- See `CLAUDE.md` for the full set of norms, the versioning ceremony, and the locked tech choices.

## License

Internal Bellese project; license to be decided before any external distribution.
