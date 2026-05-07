# v0.1.0 — Foundations (2026-05-07)

## Problem

The v0.0.0 commit locked the design but had no toolchain. To start M1 (Analysis contract artifact + LLMProvider seam) we need a buildable monorepo: TypeScript project references, lint/format/test wiring, a runnable Docker image, and per-package skeletons that the milestone work can fill in without re-debating layout.

## Solution

Ship the M0 build-plan milestone in full: a pnpm workspace with five packages (`core`, `cli`, `vscode-extension`, `chrome-extension`, `config`), TypeScript project references for incremental builds, ESLint flat config with `typescript-eslint`, Prettier, Vitest at the root, a multi-stage Node 20 Dockerfile that builds the workspace and ships a slim CLI runtime, and Make targets driven by pnpm. Stub `index.ts` per package keeps `tsc -b` clean while feature code is deferred to its milestone.

## New

- **Workspace root.** `package.json` (pnpm 9.12.3 + Node ≥20 pinned via `engines` and `packageManager`), `pnpm-workspace.yaml`, `.nvmrc` (Node 20), `tsconfig.base.json`, root `tsconfig.json` aggregating project references.
- **Five packages, all stub-level:**
  - `@bellese/test-core` — shared analyzer + renderer + LLM seam (M1+).
  - `@bellese/test-config` — config schema + Angular project auto-detection (M3).
  - `@bellese/test-cli` — `bellese-test` binary; M0 stub responds to `--help` and exits with the implementation roadmap.
  - `@bellese/test-vscode-extension` — VS Code surface (M5).
  - `@bellese/test-chrome-extension` — Manifest V3 surface (M6); tsconfig forces a browser-shaped build (DOM lib, no Node types) from M0.
- **Lint + format + test toolchain.** ESLint 9 flat config with `typescript-eslint`, Prettier 3 (single quotes, trailing commas, 100-col), Vitest 2 with `passWithNoTests` so empty suites don't fail CI.
- **Multi-stage Dockerfile.** Node 20 alpine, pnpm via corepack, two stages: install + build, then a slim runtime that runs `node /app/packages/cli/dist/index.js`. `make image` + `make smoke` validate the pipeline.
- **Versioning ceremony validated.** Bootstrap commit `v0.0.0 — Initial Design` on `main`; `make version-M0` created `V0dot1dot0/Foundations` branch and this `Versions/v0/v0.1.0/release-notes.md`.

## Changed

- **Makefile.** Replaced the `setup`/`test`/`lint`/`format` TODO stubs with pnpm-driven targets; added `build`, `format-check`. `clean` now removes `dist/`, `node_modules/`, and `.tsbuildinfo` artifacts.
- **Dockerfile.** Replaced the `alpine:3.20` placeholder with the multi-stage Node 20 build described above.
- **`.gitignore`.** Excludes `.claude/settings.local.json` (per-machine Claude Code settings).
- **`docs/07-build-plan.md`.** All M0 boxes ticked; the bullet wording was updated to match what was actually built (e.g. root pnpm scripts rather than `pnpm -r run <name>`).
- **`CLAUDE.md` / `README.md` Status sections.** No longer "design phase" — M0 complete; M1 is next. README gained a Quickstart block.

## Fixed

- (n/a — first feature commit on this branch.)

## Files Changed

| File | Change |
| ---- | ------ |
| `package.json` | New — root workspace, scripts, dev deps, packageManager pin |
| `pnpm-workspace.yaml` | New — workspace globs |
| `.nvmrc` | New — Node 20 |
| `tsconfig.base.json` | New — strict TS config shared by packages |
| `tsconfig.json` | New — root project-references aggregator |
| `eslint.config.mjs` | New — flat config with typescript-eslint |
| `.prettierrc.json` | New — formatter config |
| `.prettierignore` | New — formatter ignores |
| `vitest.config.ts` | New — Vitest at root with `passWithNoTests` |
| `packages/core/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/config/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/cli/{package.json,tsconfig.json,src/index.ts}` | New — CLI stub responds to `--help` |
| `packages/vscode-extension/{package.json,tsconfig.json,src/index.ts}` | New — stub package |
| `packages/chrome-extension/{package.json,tsconfig.json,src/index.ts}` | New — browser-shaped tsconfig (DOM lib, no Node types) |
| `Makefile` | Changed — pnpm-driven targets |
| `Dockerfile` | Changed — multi-stage Node 20 CLI build |
| `.gitignore` | Changed — exclude `.claude/settings.local.json` |
| `docs/07-build-plan.md` | Changed — M0 boxes ticked, wording aligned with implementation |
| `CLAUDE.md` | Changed — Status section reflects M0 complete; minor prettier reflow |
| `README.md` | Changed — Status + Quickstart; repo layout updated to monorepo |
| `Versions/v0/v0.1.0/release-notes.md` | New — this file |
