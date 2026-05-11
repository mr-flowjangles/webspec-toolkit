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

export interface HelpCommand {
  kind: 'help';
}

export interface ParseError {
  kind: 'error';
  message: string;
}

export type ParsedArgs = AuditCommand | HelpCommand | ParseError;

const HELP_FLAGS = new Set(['--help', '-h']);
const VALID_FORMATS = new Set<AuditFormat>(['md', 'json']);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || HELP_FLAGS.has(argv[0]!)) {
    return { kind: 'help' };
  }

  const [subcommand, ...rest] = argv;

  if (subcommand !== 'audit') {
    return { kind: 'error', message: `unknown command "${subcommand}"` };
  }

  return parseAudit(rest);
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

export const HELP_TEXT = `webspec — browser-based shift-left companion for web app development

Usage:
  webspec audit <url> [--format md|json] [--out <path>]
  webspec --help

Commands:
  audit <url>      Run a WCAG 2.1 AA + Section 508 + best-practice audit
                   against a live page (matches the extension's tag set).

Options:
  --format md|json   Output format. Defaults to md.
  --out <path>       Write to a file instead of stdout.
  --help, -h         Show this help.

Examples:
  webspec audit https://example.com
  webspec audit https://example.com --format json --out report.json
`;
