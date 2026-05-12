/**
 * Argument parsing for the webspec CLI.
 *
 * Hand-rolled — one subcommand (`audit`) with two flags. Adding commander/yargs
 * would be premature. When the surface grows (record-to-spec lands in M6) we
 * can revisit.
 *
 * Pure: returns a discriminated union, never throws, never prints. The shell
 * shim in `index.ts` handles I/O + exit codes.
 */

export type AuditFormat = 'md' | 'json';

export interface AuditCommand {
  kind: 'audit';
  url: string;
  format: AuditFormat;
  out?: string;
}

export type LLMProviderId = 'bedrock';

export interface RecordToSpecCommand {
  kind: 'record-to-spec';
  /** Path to the input `recording.json` produced by the Chrome extension. */
  input: string;
  /** Optional output path. Defaults to the input path with `.spec.ts` appended. */
  out?: string;
  /** Optional custom test name for the deterministic test() block. */
  testName?: string;
  /**
   * Optional LLM provider for amplification. When set, the deterministic
   * pass is replaced with an `AmplifyAnalyzer` call — the rendered spec
   * gains LLM-generated negative scenarios alongside the happy path.
   * Currently only `bedrock` is supported.
   */
  provider?: LLMProviderId;
}

const VALID_PROVIDERS = new Set<LLMProviderId>(['bedrock']);

export interface HelpCommand {
  kind: 'help';
}

export interface ParseError {
  kind: 'error';
  message: string;
}

export type ParsedArgs = AuditCommand | RecordToSpecCommand | HelpCommand | ParseError;

const HELP_FLAGS = new Set(['--help', '-h']);
const VALID_FORMATS = new Set<AuditFormat>(['md', 'json']);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || HELP_FLAGS.has(argv[0]!)) {
    return { kind: 'help' };
  }

  const [subcommand, ...rest] = argv;

  if (subcommand === 'audit') return parseAudit(rest);
  if (subcommand === 'record-to-spec') return parseRecordToSpec(rest);

  return { kind: 'error', message: `unknown command "${subcommand}"` };
}

function parseAudit(rest: readonly string[]): ParsedArgs {
  let url: string | undefined;
  let format: AuditFormat = 'md';
  let out: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]!;
    if (tok === '--format') {
      const value = rest[++i];
      if (value === undefined) return { kind: 'error', message: '--format requires a value' };
      if (!VALID_FORMATS.has(value as AuditFormat)) {
        return { kind: 'error', message: `--format must be md or json (got "${value}")` };
      }
      format = value as AuditFormat;
    } else if (tok === '--out') {
      const value = rest[++i];
      if (value === undefined) return { kind: 'error', message: '--out requires a path' };
      out = value;
    } else if (tok.startsWith('--')) {
      return { kind: 'error', message: `unknown flag "${tok}"` };
    } else if (url === undefined) {
      url = tok;
    } else {
      return { kind: 'error', message: `unexpected argument "${tok}"` };
    }
  }

  if (url === undefined) {
    return { kind: 'error', message: 'audit requires a URL' };
  }

  if (!isValidUrl(url)) {
    return { kind: 'error', message: `not a valid URL: "${url}"` };
  }

  return out !== undefined
    ? { kind: 'audit', url, format, out }
    : { kind: 'audit', url, format };
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function parseRecordToSpec(rest: readonly string[]): ParsedArgs {
  let input: string | undefined;
  let out: string | undefined;
  let testName: string | undefined;
  let provider: LLMProviderId | undefined;

  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]!;
    if (tok === '--out') {
      const value = rest[++i];
      if (value === undefined) return { kind: 'error', message: '--out requires a path' };
      out = value;
    } else if (tok === '--test-name') {
      const value = rest[++i];
      if (value === undefined) return { kind: 'error', message: '--test-name requires a value' };
      testName = value;
    } else if (tok === '--provider') {
      const value = rest[++i];
      if (value === undefined) return { kind: 'error', message: '--provider requires a value' };
      if (!VALID_PROVIDERS.has(value as LLMProviderId)) {
        return {
          kind: 'error',
          message: `--provider must be one of: ${[...VALID_PROVIDERS].join(', ')} (got "${value}")`,
        };
      }
      provider = value as LLMProviderId;
    } else if (tok.startsWith('--')) {
      return { kind: 'error', message: `unknown flag "${tok}"` };
    } else if (input === undefined) {
      input = tok;
    } else {
      return { kind: 'error', message: `unexpected argument "${tok}"` };
    }
  }

  if (input === undefined) {
    return { kind: 'error', message: 'record-to-spec requires a recording.json path' };
  }

  const cmd: RecordToSpecCommand = { kind: 'record-to-spec', input };
  if (out !== undefined) cmd.out = out;
  if (testName !== undefined) cmd.testName = testName;
  if (provider !== undefined) cmd.provider = provider;
  return cmd;
}

export const HELP_TEXT = `webspec — browser-based shift-left companion for web app development

Usage:
  webspec audit <url> [--format md|json] [--out <path>]
  webspec record-to-spec <recording.json> [--out <path>] [--test-name <name>] [--provider bedrock]
  webspec --help

Commands:
  audit <url>                  Run a WCAG 2.1 AA + Section 508 + best-practice
                               audit against a live page (matches the extension's
                               tag set).
  record-to-spec <path>        Render a WorkflowRecording JSON (from the Chrome
                               extension) into a runnable Playwright .spec.ts.
                               Deterministic by default (happy path only);
                               pass --provider to add LLM-generated negative
                               scenarios alongside the happy path.

Options:
  --format md|json   Output format for audit. Defaults to md.
  --out <path>       Write to a file instead of the default location.
  --test-name <s>    Override the test() title (record-to-spec only,
                     deterministic mode).
  --provider <name>  LLM provider for amplification (record-to-spec only).
                     Currently: bedrock. Requires AWS credentials.
  --help, -h         Show this help.

Examples:
  webspec audit https://example.com
  webspec audit https://example.com --format json --out report.json
  webspec record-to-spec recording.json
  webspec record-to-spec recording.json --out tests/login.spec.ts
  webspec record-to-spec recording.json --provider bedrock
`;
