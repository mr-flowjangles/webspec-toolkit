# Angular Automated Testing

An LLM-powered toolkit that generates Angular unit tests and runs Section 508 / WCAG audits — shared core with VS Code and Chrome extensions on top, reusable across Bellese projects.

## Status

**M0 complete (Foundations).** Monorepo scaffold + toolchain wired (pnpm, tsc -b, ESLint, Prettier, Vitest, Docker). CLI `--help` stub builds and ships in the image. **M1 — Contract artifact + LLM provider seam — is next.** See `docs/07-build-plan.md` for the milestone sequence.

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
├── packages/                 # monorepo: core, cli, vscode-extension, chrome-extension, config
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
