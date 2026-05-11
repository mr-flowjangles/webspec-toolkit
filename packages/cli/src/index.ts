#!/usr/bin/env node
/**
 * webspec CLI entry point.
 *
 * Thin shell shim: parse argv → dispatch to a command → write output → set exit.
 * The dispatchable logic lives in `./commands/*`. The pure arg parser lives in
 * `./args.js`.
 *
 * Exit codes:
 *   0 — command ran cleanly (regardless of audit findings)
 *   1 — runtime error (puppeteer launch failed, network, FS)
 *   2 — bad arguments (caller-side error)
 */
import { runAudit } from './commands/audit.js';
import { HELP_TEXT, parseArgs } from './args.js';

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.kind) {
    case 'help':
      process.stdout.write(HELP_TEXT);
      return 0;

    case 'error':
      process.stderr.write(`webspec: ${parsed.message}\n\n`);
      process.stderr.write(HELP_TEXT);
      return 2;

    case 'audit': {
      try {
        const result = await runAudit(parsed);
        if (result.stdout !== undefined) process.stdout.write(result.stdout);
        process.stderr.write(`webspec audit: ${result.log}\n`);
        return 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`webspec audit: ${msg}\n`);
        return 1;
      }
    }
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`webspec: unexpected error: ${err}\n`);
    process.exit(1);
  },
);
