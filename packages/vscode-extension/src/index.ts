// @webspec/vscode-extension — VS Code surface. Real activation lands in M7.
// In M7 this entry point becomes activate(context) per the VS Code extension API.
// VS Code exposes test-gen, a11y audit, and "render recording → .spec.ts" — but
// not the recorder itself (no live tab in the editor); the recorder lives in M5.
export const VSCODE_EXTENSION_STUB = true;
