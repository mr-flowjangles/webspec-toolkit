#!/usr/bin/env node
// bellese-test — CLI stub. Real commands (gen, audit) land in M3 / M4.
// At M0 this exists so make image / make smoke can verify the Docker pipeline.
const arg = process.argv[2];

if (!arg || arg === '--help' || arg === '-h') {
  console.log('bellese-test 0.0.0 (M0 stub)');
  console.log('');
  console.log('Usage:');
  console.log('  bellese-test gen <component.ts>   Generate Jest spec — landing in M3');
  console.log('  bellese-test audit <url>          Run WCAG/508 audit — landing in M4');
  console.log('');
  console.log('See docs/07-build-plan.md for the implementation roadmap.');
  process.exit(0);
}

console.error(`bellese-test: unknown command "${arg}" — CLI commands ship in M3+`);
process.exit(2);
