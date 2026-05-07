/**
 * Integration test for the M2 source-driven test-generation pipeline.
 *
 * Pins the parser → renderer round-trip against three real Angular 19+
 * standalone-component fixtures: a presentational decorator-based component,
 * a service-injecting constructor-DI component, and a signal-based component
 * that exercises input()/output()/inject().
 *
 * The LLM (TestPlanAnalyzer) is NOT exercised here. The cases[] for each
 * fixture come from a hand-authored JSON, snapshotting what a competent
 * LLM would emit. This isolates the renderer's behavior from the LLM's
 * non-determinism.
 *
 * Full live-Bedrock + Jest-against-real-Angular-app verification is deferred —
 * see docs/99-open-questions.md "M2 e2e Jest verification."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseComponentSurface, renderTestPlan } from '../../src/index.js';
import type { TestPlan } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, '..', 'fixtures');

interface Fixture {
  componentFile: string;
  testPlanFile: string;
  expectedComponentName: string;
  expectedFromRender: string[];
}

const fixtures: Fixture[] = [
  {
    componentFile: 'components/greeter.component.ts',
    testPlanFile: 'test-plans/greeter.json',
    expectedComponentName: 'GreeterComponent',
    expectedFromRender: [
      `import { GreeterComponent } from './greeter.component';`,
      `imports: [GreeterComponent]`,
      `'projects a custom name input'`,
    ],
  },
  {
    componentFile: 'components/user-list.component.ts',
    testPlanFile: 'test-plans/user-list.json',
    expectedComponentName: 'UserListComponent',
    expectedFromRender: [
      `import { UserListComponent } from './user-list.component';`,
      // standard provider mocks for the recognized DI tokens
      `provideHttpClient(), provideHttpClientTesting()`,
      `provideRouter([])`,
      // generic stub for the unknown UserService
      `{ provide: UserService, useValue: {} }`,
    ],
  },
  {
    componentFile: 'components/signal-counter.component.ts',
    testPlanFile: 'test-plans/signal-counter.json',
    expectedComponentName: 'SignalCounterComponent',
    expectedFromRender: [
      `import { SignalCounterComponent } from './signal-counter.component';`,
      `imports: [SignalCounterComponent]`,
      `'increment() emits changed with the new value'`,
      // signal-aware setInput pattern came through from the test plan
      `fixture.componentRef.setInput('initial'`,
    ],
  },
];

describe('M2 integration — parser + renderer against fixture components', () => {
  for (const fixture of fixtures) {
    describe(fixture.expectedComponentName, () => {
      const componentPath = resolve(fixturesDir, fixture.componentFile);
      const planPath = resolve(fixturesDir, fixture.testPlanFile);
      const plan = JSON.parse(readFileSync(planPath, 'utf-8')) as TestPlan;

      it('parser extracts a non-null surface from the source file', () => {
        const parsed = parseComponentSurface(componentPath);
        expect(parsed).not.toBeNull();
        expect(parsed!.unit.name).toBe(fixture.expectedComponentName);
        expect(parsed!.unit.kind).toBe('component');
      });

      it('parsed surface aligns with the recorded TestPlan surface', () => {
        const parsed = parseComponentSurface(componentPath);
        const parsedSurface = parsed!.surface;
        const planSurface = plan.surface;

        // Inputs: same names + same isSignal flag (we trust the plan author for type details)
        expect(parsedSurface.inputs.map((i) => ({ name: i.name, isSignal: i.isSignal }))).toEqual(
          planSurface.inputs.map((i) => ({ name: i.name, isSignal: i.isSignal })),
        );

        // Outputs: same names + same isSignalOutput flag
        expect(
          parsedSurface.outputs.map((o) => ({ name: o.name, isSignalOutput: o.isSignalOutput })),
        ).toEqual(
          planSurface.outputs.map((o) => ({ name: o.name, isSignalOutput: o.isSignalOutput })),
        );

        // Public method names match
        expect(parsedSurface.publicMethods.map((m) => m.name)).toEqual(
          planSurface.publicMethods.map((m) => m.name),
        );

        // Lifecycle hooks match
        expect(parsedSurface.lifecycle.sort()).toEqual([...planSurface.lifecycle].sort());

        // Dep names match (types may render slightly differently between parser and hand-authored plan)
        expect(parsedSurface.deps.map((d) => d.name).sort()).toEqual(
          planSurface.deps.map((d) => d.name).sort(),
        );
      });

      it('renderer produces a spec containing the expected idioms', () => {
        const rendered = renderTestPlan(plan);
        for (const expected of fixture.expectedFromRender) {
          expect(rendered, `rendered output should contain: ${expected}`).toContain(expected);
        }
      });

      it('renderer output starts with the @angular/core/testing import', () => {
        const rendered = renderTestPlan(plan);
        expect(rendered.split('\n')[0]).toBe(
          `import { ComponentFixture, TestBed } from '@angular/core/testing';`,
        );
      });

      it('renderer output emits one it() block per case', () => {
        const rendered = renderTestPlan(plan);
        const itCount = (rendered.match(/^\s+it\('/gm) ?? []).length;
        expect(itCount).toBe(plan.cases.length);
      });

      it('renderer output ends with the closing describe brace + newline', () => {
        const rendered = renderTestPlan(plan);
        expect(rendered.trimEnd().endsWith('});')).toBe(true);
      });
    });
  }
});
