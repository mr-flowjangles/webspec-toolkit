# v0.3.1 — Rename To Webspec (2026-05-08)

## Problem

The tool's name `bellese-test` and npm scope `@bellese/test-*` tied the project to one company. The product is a frontend testing toolkit (unit tests + Section 508 / WCAG audits + Playwright e2e from recordings) — none of which is Bellese-specific. A company-locked name made the project look narrower than it is and would have grown more expensive to fix with every PR, doc, and external reference that landed under the old identity.

## Solution

Renamed the tool to **webspec**. "spec" elegantly covers all three outputs (Jest specs, Playwright specs, a11y findings) and the name says nothing about what framework the page is built with. Did the rename now — at v0.3.1, 5 PRs in — because the cost grows monotonically with time and external traffic, and it's near-zero today.

Mechanical changes:

- CLI bin: `bellese-test` → `webspec`
- npm scope: `@bellese/test-*` → `@webspec/*` (drops the redundant `test-` prefix; the scope itself now implies the project)
  - `@bellese/test-core` → `@webspec/core`
  - `@bellese/test-cli` → `@webspec/cli`
  - `@bellese/test-config` → `@webspec/config`
  - `@bellese/test-chrome-extension` → `@webspec/chrome-extension`
  - `@bellese/test-vscode-extension` → `@webspec/vscode-extension`
- Config filename (planned, not yet implemented): `bellese-test.config.json` → `webspec.config.json`
- Cache directory reference (planned): `.bellese-test/cache/` → `.webspec/cache/`
- Docker image tag: `bellese/angular-automated-testing:dev` → `webspec/angular-automated-testing:dev`

Prose changes where company-specific framing conflicted with the rename:

- `CLAUDE.md` top-line description: rebranded to lead with **webspec** and dropped "reusable across Bellese projects" framing.
- `docs/mission.md`: "Drop into any Bellese Angular repo" → "Drop into any Angular repo." Other "Bellese" references that describe origin/audience (built at Bellese, used by Bellese teams, federal-customer context) are factually accurate and were preserved.

Untouched:

- `Versions/v*/release-notes.md` — historical artifacts of what shipped under the old name; rewriting them would be dishonest.
- Repo name `angular-automated-testing` — to be renamed on GitHub as part of this version (manual step Rob owns). The repo name follows the project, not the other way around. GitHub auto-redirects old URLs so existing links don't rot.
- `infra/terraform/` — no infra under the old name was deployed.

## New

- `webspec` CLI bin (replaces the `bellese-test` stub).

## Changed

- All package manifests, src headers, `PACKAGE_NAME` constants, CLI output strings, Dockerfile labels, Makefile docker tag, and docs (`00-overview`, `01-architecture`, `02-contract-spec`, `07-build-plan`, `99-open-questions`, `mission`) reference the new identity.
- `pnpm-lock.yaml` regenerated under the new scope.

## Fixed

- Project name no longer over-claims a company-specific scope.

## Files Changed

| File | Change |
|------|--------|
| `CLAUDE.md` | Top-line description rebranded to webspec; drop "Bellese projects" framing. |
| `Dockerfile` | Comment + LABEL description updated; smoke-test reference uses `webspec --help`. |
| `Makefile` | Docker image tag `bellese/angular-automated-testing:dev` → `webspec/angular-automated-testing:dev`. |
| `docs/00-overview.md` | `bellese-test` → `webspec` (CLI commands + config filename). |
| `docs/01-architecture.md` | Config-filename + diagram references. |
| `docs/02-contract-spec.md` | `@bellese/test-core` and `@bellese/test-config` references. |
| `docs/07-build-plan.md` | All `bellese-test` references in v1 DoD + M3/M4 task lists. |
| `docs/99-open-questions.md` | CLI references in M3 e2e trigger and recording-transport notes; cache-dir example. |
| `docs/mission.md` | Tool/config name; "any Bellese Angular repo" → "any Angular repo." |
| `packages/cli/package.json` | `name`, `description`, `bin`, deps under `@webspec/*`. |
| `packages/cli/src/index.ts` | All CLI output strings reference `webspec`. |
| `packages/core/package.json` | `name`, `description`. |
| `packages/core/src/index.ts` | Header comment + `PACKAGE_NAME` constant. |
| `packages/core/src/llm/bedrock.ts` | Header comment. |
| `packages/core/src/types/analysis.ts` | Comment about `ResolvedConfig` ownership. |
| `packages/config/package.json` | `name`, `description`. |
| `packages/config/src/index.ts` | Header comment + `PACKAGE_NAME` constant. |
| `packages/chrome-extension/package.json` | `name`, deps. |
| `packages/chrome-extension/src/index.ts` | Header comment. |
| `packages/vscode-extension/package.json` | `name`, `displayName`, deps. |
| `packages/vscode-extension/src/index.ts` | Header comment. |
| `pnpm-lock.yaml` | Regenerated under `@webspec/*` scope. |

## Verification

- `make build` — green (`tsc -b` across all 5 workspace packages).
- `make ci` — green (eslint clean; vitest 61/61 tests pass: parser, renderer, bedrock adapter, integration).
- No `bellese-test` or `@bellese/test-` references remain anywhere outside `Versions/` (historical).
