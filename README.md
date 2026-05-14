# webspec

A browser-based shift-left companion for web app development. The Chrome extension records a user's workflow, audits the page for Section 508 / WCAG issues, and renders the recording into a runnable Playwright spec with positive AND negative scenarios (LLM-amplified). Short feedback loops — catch problems while you're building, not after.

## Status

**M5 (Chrome extension) and M6 (`WorkflowRecording` → Playwright renderer) both shipped.** Audit mode (axe-core, WCAG 2.1 AA + Section 508 + best-practice) and recorder mode (hardened selectors, dedup, session persistence, navigation capture, review-then-download) verified end-to-end against three real public sites (`v0.6.0`). The render-to-spec path is verified against those same three sites (`v0.7.6`) — recordings render to Playwright specs that pass on the live URL. v1 ships once the remaining DoD boxes in `docs/07-build-plan.md` are ticked.

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
2. Click the webspec icon → **Record**
3. Walk through the flow (clicks, typing, form submits, checkboxes, selects, key presses are all captured; passwords are masked automatically; recording state survives popup close)
4. When done, open the popup → **Stop**
5. Review the trace summary and the "review before sharing" warning, then **Download recording.json**

### 5. Render a Playwright spec

Deterministic happy-path (no LLM, always works):

```sh
node packages/cli/dist/index.js record-to-spec ~/Downloads/recording.json
# → writes ~/Downloads/recording.spec.ts
```

LLM-amplified (adds negative scenarios — invalid input, empty fields, error states — as additional `test()` blocks alongside the happy path; requires AWS credentials for Bedrock):

```sh
node packages/cli/dist/index.js record-to-spec ~/Downloads/recording.json --provider bedrock
```

The renderer uses `getByRole` selectors with the hardened forms captured at record time, so the spec is robust to typical DOM churn.

### 6. Run the spec

From the cloned `webspec-toolkit/` directory:

```sh
# First time only: install Chromium for Playwright.
pnpm --filter @webspec/cli exec playwright install chromium

# Run any rendered spec against its live target URL:
make run-spec SPEC=~/Downloads/recording.spec.ts
```

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
