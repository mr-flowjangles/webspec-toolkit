# v0.3.7 — M5 Chrome Extension Scaffold (2026-05-11)

## Problem

M4 is done — the Node-mode audit pipeline runs end-to-end via `webspec audit <url>`. The v1 mission ("browser-based shift-left companion") needs the *browser* surface, M5, which is the v1 flagship. Before any feature work can land (audit injection, workflow recorder), the package needs a real Manifest V3 + Vite + React + TypeScript build pipeline. The `packages/chrome-extension` directory has been a one-line stub since M0; that stub can't host any of the M5 features.

## Solution

Stand up a working Manifest V3 extension that builds via Vite, loads unpacked in Chrome, and has the three entry points M5 needs (popup, content script, service worker) wired into a single build pipeline. Real features (audit, recorder) land in subsequent M5 PRs against this scaffold.

- **Bundler:** Vite 5 + `@crxjs/vite-plugin` 2 (the standard MV3 + Vite stack). Manifest defined in `manifest.config.ts` so entry-point paths can be referenced symbolically and the version is pulled from `package.json`.
- **Popup:** React 18 (StrictMode, createRoot). Stub UI shows the webspec brand, a one-line tagline, and two disabled `Audit / Record` buttons with tooltips noting which PR brings them online. Minimal CSS that respects light/dark via `color-scheme`.
- **Content script:** logs a load marker on `document_idle` for every http(s) page. Real injection logic (axe-core, then recorder event capture) lands in later PRs.
- **Service worker:** logs install reason on `chrome.runtime.onInstalled`. `chrome.webRequest` listener and message bus land with the recorder.
- **Browser entry on `@webspec/core`** — new export `@webspec/core/browser` re-exports only browser-safe modules: `A11yReport` types, `normalizeAxeResults`, `renderA11yReportMarkdown`, `renderA11yReportJson`, plus the LLM provider interface (no Bedrock adapter). The Node-only modules (`A11yAnalyzer`, `TestPlanAnalyzer`, `BedrockAdapter`) remain on the main entry. This makes the Node/browser boundary explicit so the Vite bundler can't accidentally pull in `puppeteer` or `ts-morph`.
- **Build pipeline:**
  - `packages/chrome-extension` switches from `tsc -b` to `vite build`. Vite handles bundling + TS transpilation; type-checking happens via the editor + (eventually) a `tsc --noEmit` pre-commit step.
  - Extension removed from root `tsconfig.json` project references (it now has `noEmit: true` + `composite: false`, incompatible with project references).
  - New `make ext-build` target → `pnpm --filter @webspec/chrome-extension build`.
  - `make ci` chain becomes `lint test build ext-build` so a CI run catches extension build breakage too (and `build` runs first to populate `@webspec/core/dist` which the extension imports from).
- **Build plan housekeeping:** M4 checkboxes in `docs/07-build-plan.md` ticked. The "browser-mode A11yAnalyzer" task is now explicitly folded into M5 (no callsite outside the extension); ships as M5's second PR.

## New

- `packages/chrome-extension/manifest.config.ts` — MV3 manifest as TypeScript.
- `packages/chrome-extension/vite.config.ts` — Vite + React + CRX plugin.
- `packages/chrome-extension/src/popup/{index.html, main.tsx, App.tsx, popup.css}` — React popup stub.
- `packages/chrome-extension/src/content-script/index.ts` — load-marker content script.
- `packages/chrome-extension/src/service-worker/index.ts` — install-logger service worker.
- `packages/core/src/browser.ts` — browser-safe re-exports.
- `ext-build` Makefile target.

## Changed

- `packages/core/package.json` — `exports` map adds `./browser` entry pointing to `dist/browser.js`.
- `packages/chrome-extension/package.json` — switched build to `vite build`; added React, axe-core, Vite, CRX, and `@types/{chrome, react, react-dom}` deps.
- `packages/chrome-extension/tsconfig.json` — `noEmit: true`, `composite: false`, `jsx: react-jsx`, `moduleResolution: Bundler`, types include `chrome` and `vite/client`.
- `tsconfig.json` (root) — dropped chrome-extension from project references (handled by Vite now).
- `Makefile` — `ci` now includes `build` + `ext-build`; new `ext-build` target.
- `docs/07-build-plan.md` — M4 checkboxes ticked with version pointers; M4 task "browser-mode analyzer" annotated as folded into M5.

## Removed

- `packages/chrome-extension/src/index.ts` — the M0 stub re-export is gone; entry points now live under `src/{popup, content-script, service-worker}/`.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/browser.ts` | New — browser-safe re-exports. |
| `packages/core/package.json` | Add `./browser` to exports map. |
| `packages/chrome-extension/package.json` | Switch build to Vite; add React + axe + CRX + types. |
| `packages/chrome-extension/tsconfig.json` | Browser/bundler-shaped TS config. |
| `packages/chrome-extension/manifest.config.ts` | New — MV3 manifest. |
| `packages/chrome-extension/vite.config.ts` | New — Vite + React + CRX. |
| `packages/chrome-extension/src/popup/` | New popup (HTML, React entry, App component, CSS). |
| `packages/chrome-extension/src/content-script/index.ts` | New — load marker. |
| `packages/chrome-extension/src/service-worker/index.ts` | New — install logger. |
| `packages/chrome-extension/src/index.ts` | Removed — replaced by per-entry-point modules. |
| `tsconfig.json` | Drop chrome-extension from project references. |
| `Makefile` | New `ext-build`; `ci` now includes `build` + `ext-build`. |
| `docs/07-build-plan.md` | Tick M4 checkboxes; annotate browser-mode analyzer as folded into M5. |
| `Versions/v0/v0.3.7/release-notes.md` | This file. |

## Verification

`make ci` green: lint clean, **110/110 tests pass**, library build clean, extension Vite bundle clean (~143 KB JS, 46 KB gzipped). Build artifacts land in `packages/chrome-extension/dist/`.

### Live smoke — load the extension in Chrome

1. From the repo root, run `make build && make ext-build` (or just `make ci`).
2. Open Chrome → `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** → select `packages/chrome-extension/dist/`.
5. **Expected:**
   - The extension shows up as `webspec` with the description above.
   - Its **Service Worker** link in `chrome://extensions` works; clicking it opens DevTools showing `[webspec] service worker installed: install`.
   - Pinning the extension and clicking the toolbar icon opens a popup that says `webspec` + the tagline + two disabled `Audit this tab` / `Record workflow` buttons.
   - Navigating to any http(s) page → opening DevTools → Console shows `[webspec] content script loaded: <url>`.

If any of those steps fails, that's a real bug — open an issue or flag it before the next M5 PR layers features on top.
