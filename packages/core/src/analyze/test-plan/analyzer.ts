/**
 * TestPlanAnalyzer — Phase 1 source-driven analyzer for Jest unit tests.
 *
 * Pipeline:
 *   filePath → parser → ParsedComponentSurface → LLM (cases only) → TestPlan → Analysis envelope.
 *
 * The LLM never returns the surface — only the `cases[]`. The analyzer
 * assembles the TestPlan locally so the model cannot fabricate inputs,
 * outputs, or methods that aren't actually on the component.
 */
import { z } from 'zod';
import type { Analysis, TestCase } from '../../types/analysis.js';
import { TestCaseSchema } from '../../types/analysis.js';
import type { LLMProvider } from '../../llm/provider.js';
import { parseComponentSurface, type ParsedComponentSurface } from './parser.js';
import { SYSTEM_PROMPT, formatUserPrompt } from './prompt.js';

export class NoComponentFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`No @Component class found in ${filePath}`);
    this.name = 'NoComponentFoundError';
  }
}

const TestCasesResponseSchema = z.object({
  cases: z.array(TestCaseSchema),
});

export interface AnalyzeOptions {
  /** Path to the Angular source file (e.g. `src/app/foo.component.ts`). */
  filePath: string;
  /** Tool version for the resulting Analysis.meta. Caller-provided. */
  toolVersion: string;
  /** Resolved config snapshot for the resulting Analysis.meta. */
  config: unknown;
  /** Optional override for the parsed surface. Useful for tests + caches. */
  parsedSurface?: ParsedComponentSurface;
}

export class TestPlanAnalyzer {
  constructor(private readonly llm: LLMProvider) {}

  async analyze(opts: AnalyzeOptions): Promise<Analysis> {
    const parsed = opts.parsedSurface ?? parseComponentSurface(opts.filePath);
    if (!parsed) throw new NoComponentFoundError(opts.filePath);

    const cases = await this.generateCases(parsed);

    return {
      kind: 'testPlan',
      data: {
        unit: parsed.unit,
        surface: parsed.surface,
        cases,
        framework: 'jest',
        styleHints: parsed.styleHints,
      },
      meta: {
        schemaVersion: '1',
        toolVersion: opts.toolVersion,
        createdAt: new Date().toISOString(),
        source: { kind: 'file', ref: opts.filePath },
        config: opts.config,
      },
    };
  }

  private async generateCases(parsed: ParsedComponentSurface): Promise<TestCase[]> {
    const result = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: formatUserPrompt(parsed) }],
      schema: TestCasesResponseSchema,
      schemaName: 'TestCases',
      schemaDescription:
        'A focused suite of Jest test cases covering the supplied component surface. Return only the cases[] array — do not include surface, framework, or styleHints fields.',
    });

    return result.cases;
  }
}
