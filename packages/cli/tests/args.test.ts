/**
 * Tests for the webspec CLI argument parser. Pure — no FS, no browser,
 * no process.argv mutation. The parser returns a discriminated union
 * (audit | help | error) which the index.ts shim dispatches on.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs — help', () => {
  it('returns help when argv is empty', () => {
    expect(parseArgs([])).toEqual({ kind: 'help' });
  });

  it('returns help on --help', () => {
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('returns help on -h', () => {
    expect(parseArgs(['-h'])).toEqual({ kind: 'help' });
  });
});

describe('parseArgs — audit', () => {
  it('parses a bare URL with defaults', () => {
    expect(parseArgs(['audit', 'https://example.com'])).toEqual({
      kind: 'audit',
      url: 'https://example.com',
      format: 'md',
    });
  });

  it('accepts --format md explicitly', () => {
    expect(parseArgs(['audit', 'https://example.com', '--format', 'md'])).toMatchObject({
      kind: 'audit',
      format: 'md',
    });
  });

  it('accepts --format json', () => {
    expect(parseArgs(['audit', 'https://example.com', '--format', 'json'])).toMatchObject({
      kind: 'audit',
      format: 'json',
    });
  });

  it('accepts --out and includes it in the parsed command', () => {
    expect(parseArgs(['audit', 'https://example.com', '--out', 'r.md'])).toEqual({
      kind: 'audit',
      url: 'https://example.com',
      format: 'md',
      out: 'r.md',
    });
  });

  it('accepts flags before the URL', () => {
    expect(
      parseArgs(['audit', '--format', 'json', '--out', 'r.json', 'https://example.com']),
    ).toEqual({
      kind: 'audit',
      url: 'https://example.com',
      format: 'json',
      out: 'r.json',
    });
  });
});

describe('parseArgs — errors', () => {
  it('errors on unknown subcommand', () => {
    expect(parseArgs(['gen', 'foo.ts'])).toEqual({
      kind: 'error',
      message: 'unknown command "gen"',
    });
  });

  it('errors when audit has no URL', () => {
    expect(parseArgs(['audit'])).toEqual({
      kind: 'error',
      message: 'audit requires a URL',
    });
  });

  it('errors on invalid URL', () => {
    expect(parseArgs(['audit', 'not-a-url'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('not a valid URL'),
    });
  });

  it('errors on --format with no value', () => {
    expect(parseArgs(['audit', 'https://example.com', '--format'])).toEqual({
      kind: 'error',
      message: '--format requires a value',
    });
  });

  it('errors on --format with unknown value', () => {
    expect(parseArgs(['audit', 'https://example.com', '--format', 'yaml'])).toEqual({
      kind: 'error',
      message: '--format must be md or json (got "yaml")',
    });
  });

  it('errors on --out with no value', () => {
    expect(parseArgs(['audit', 'https://example.com', '--out'])).toEqual({
      kind: 'error',
      message: '--out requires a path',
    });
  });

  it('errors on unknown flag', () => {
    expect(parseArgs(['audit', 'https://example.com', '--fail-on', 'critical'])).toEqual({
      kind: 'error',
      message: 'unknown flag "--fail-on"',
    });
  });

  it('errors on extra positional argument', () => {
    expect(parseArgs(['audit', 'https://a.com', 'https://b.com'])).toEqual({
      kind: 'error',
      message: 'unexpected argument "https://b.com"',
    });
  });
});

describe('parseArgs — record-to-spec', () => {
  it('parses a bare path with defaults', () => {
    expect(parseArgs(['record-to-spec', 'recording.json'])).toEqual({
      kind: 'record-to-spec',
      input: 'recording.json',
    });
  });

  it('accepts --out for a custom output path', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--out', 'tests/login.spec.ts'])).toEqual({
      kind: 'record-to-spec',
      input: 'recording.json',
      out: 'tests/login.spec.ts',
    });
  });

  it('accepts --test-name to override the test() title', () => {
    expect(
      parseArgs(['record-to-spec', 'recording.json', '--test-name', 'login then logout']),
    ).toEqual({
      kind: 'record-to-spec',
      input: 'recording.json',
      testName: 'login then logout',
    });
  });

  it('errors when the recording path is missing', () => {
    expect(parseArgs(['record-to-spec'])).toEqual({
      kind: 'error',
      message: 'record-to-spec requires a recording.json path',
    });
  });

  it('errors on --out with no value', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--out'])).toEqual({
      kind: 'error',
      message: '--out requires a path',
    });
  });

  it('errors on --test-name with no value', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--test-name'])).toEqual({
      kind: 'error',
      message: '--test-name requires a value',
    });
  });

  it('errors on unknown flag', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--negative'])).toEqual({
      kind: 'error',
      message: 'unknown flag "--negative"',
    });
  });

  it('errors on extra positional argument', () => {
    expect(parseArgs(['record-to-spec', 'a.json', 'b.json'])).toEqual({
      kind: 'error',
      message: 'unexpected argument "b.json"',
    });
  });

  it('accepts --provider bedrock', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--provider', 'bedrock'])).toEqual({
      kind: 'record-to-spec',
      input: 'recording.json',
      provider: 'bedrock',
    });
  });

  it('errors on --provider with an unknown value', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--provider', 'openai'])).toEqual({
      kind: 'error',
      message: '--provider must be one of: bedrock (got "openai")',
    });
  });

  it('errors on --provider with no value', () => {
    expect(parseArgs(['record-to-spec', 'recording.json', '--provider'])).toEqual({
      kind: 'error',
      message: '--provider requires a value',
    });
  });
});
