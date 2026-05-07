// @bellese/test-chrome-extension — Manifest V3 surface. Real popup + content
// script land in M5 (the flagship "easy to use" surface). M5 ships two modes:
// a11y audit (axe-core) and workflow recorder (DOM + network event capture
// → WorkflowRecording JSON exported via chrome.downloads). tsconfig excludes
// Node types and adds DOM lib so this package is forced into a browser-shaped
// build from M0 onward.
export const CHROME_EXTENSION_STUB = true;
