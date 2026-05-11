# webspec

A browser-based shift-left companion for web app development. The Chrome extension records a user's workflow, audits the page for Section 508 / WCAG issues, and renders the recording into a runnable Playwright spec with positive AND negative scenarios (LLM-amplified). Short feedback loops — catch problems while you're building, not after.

## Status

**M5 done at v0.6.0 — Chrome extension flagship surface shipped.** Audit mode (axe-core, WCAG 2.1 AA + Section 508 + best-practice) and recorder mode (hardened selectors, dedup, session persistence, navigation capture, review-then-download) both verified end-to-end on three real public sites. CLI `webspec audit` ships and is at parity with the extension on the same tag set. **M6 — `WorkflowRecording` → Playwright renderer with LLM amplification — is next.** See `docs/07-build-plan.md` for the milestone sequence.

## Quickstart

```sh
nvm use            # Node 20 (see .nvmrc)
make setup         # pnpm install
make ci            # lint + test (empty suite for now)
make build         # tsc -b across the workspace
make image && make smoke
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
├── infra/terraform/          # AWS deployment (defined when deployment is real)
└── Versions/                 # one folder per version, with release-notes.md
```

## Working norms

- Design before code. If implementation surfaces a question the docs didn't answer, stop and update the relevant doc (or `docs/99-open-questions.md`) before resuming.
- The build plan is authoritative. Tick milestones as they land; don't start the next milestone until the previous one's "Done when" is true.
- See `CLAUDE.md` for the full set of norms, the versioning ceremony, and the locked tech choices.

## License

Internal Bellese project; license to be decided before any external distribution.
