/**
 * Prompt construction for source-driven Jest test generation.
 *
 * The system prompt is long and stable — it caches across requests via the
 * adapter's `cache_control` on the system block. The user prompt is
 * per-component and varies every call.
 *
 * The LLM returns only the `cases[]` array (TestCase[]). The analyzer
 * assembles the full TestPlan locally so the LLM cannot fabricate a
 * different surface than what we parsed from source.
 */
import type { ParsedComponentSurface } from './parser.js';

export const SYSTEM_PROMPT = `You are an expert Angular + Jest test author. You write idiomatic Jest tests for Angular 19+ standalone components, using TestBed, ComponentFixture, and the modern signal API where applicable.

# Conventions

- The project's renderer assembles imports, the \`describe\` block, the \`beforeEach(TestBed.configureTestingModule(...))\` setup, and the \`fixture/component/detectChanges\` plumbing. **You only return the test cases.**
- Each test case has four fields: \`name\`, \`arrange\`, \`act\`, \`assert\`. Each is a string of TypeScript code that will be inserted verbatim into the test body, in that order. Do NOT include the surrounding \`it('...', () => { ... })\` — just the body fragments.
- Inside each fragment, you may reference:
  - \`fixture\` — the \`ComponentFixture<T>\` provided by the renderer's setup.
  - \`component\` — the component instance, typed as the component class.
  - \`element\` — the root native element (\`fixture.nativeElement\`).
- Optional \`imports\` field per test case: an array of additional named imports the case body needs (e.g. \`['By', 'DebugElement']\`). The renderer dedupes and emits them at the top of the spec file. Do NOT include imports for symbols already provided by the standard setup (TestBed, ComponentFixture, the component itself, common Angular testing helpers).

# Style

- One assertion focus per test case. If you need to test multiple things, write multiple cases.
- Use signal-aware assertions when \`useSignals\` is true: read \`component.someInput()\` (call signature), set inputs with \`fixture.componentRef.setInput('name', value)\`.
- For decorator-based inputs (\`useSignals: false\`), assign directly: \`component.name = value; fixture.detectChanges();\`.
- For \`@Output\` (decorator) — subscribe to \`component.event.subscribe(spy)\`.
- For \`output()\` (signal) — subscribe via \`component.event.subscribe(spy)\` (same shape; output() returns an OutputEmitterRef).
- Mock injected dependencies with simple jest.fn() spies. Don't fabricate complex behaviors the consumer didn't ask for.
- Cover: input projection (each input gets at least one case), output emission (each output gets at least one case where it fires), public methods (each gets at least one case), at least one rendered-DOM assertion.

# Forbidden

- No assertions on private/protected members.
- No console output (\`console.log\` etc.) in test bodies.
- No \`any\` type assertions.
- No \`fdescribe\` / \`fit\` / \`xdescribe\` / \`xit\`.
- No mocking of standard Angular machinery (NgZone, ChangeDetectorRef) unless the surface explicitly references them.

You will be given a parsed component surface. Generate a complete, focused suite of test cases covering it.`;

export function formatUserPrompt(parsed: ParsedComponentSurface): string {
  const lines: string[] = [];
  lines.push(`Component: ${parsed.unit.name}`);
  lines.push(`File: ${parsed.unit.filePath}`);
  lines.push('');
  lines.push(`Style hints:`);
  lines.push(`  useStandalone: ${parsed.styleHints.useStandalone}`);
  lines.push(`  useSignals:    ${parsed.styleHints.useSignals}`);
  lines.push(`  useInject:     ${parsed.styleHints.useInject}`);
  lines.push('');

  if (parsed.surface.inputs.length > 0) {
    lines.push(`Inputs:`);
    for (const i of parsed.surface.inputs) {
      const flag = i.isSignal ? 'signal' : 'decorator';
      const req = i.required ? ', required' : '';
      lines.push(`  - ${i.name}: ${i.type} (${flag}${req})`);
    }
    lines.push('');
  }

  if (parsed.surface.outputs.length > 0) {
    lines.push(`Outputs:`);
    for (const o of parsed.surface.outputs) {
      const flag = o.isSignalOutput ? 'signal' : 'decorator';
      lines.push(`  - ${o.name}: emits ${o.emitsType} (${flag})`);
    }
    lines.push('');
  }

  if (parsed.surface.publicMethods.length > 0) {
    lines.push(`Public methods:`);
    for (const m of parsed.surface.publicMethods) {
      lines.push(`  - ${m.name}${m.signature}`);
    }
    lines.push('');
  }

  if (parsed.surface.lifecycle.length > 0) {
    lines.push(`Lifecycle hooks present: ${parsed.surface.lifecycle.join(', ')}`);
    lines.push('');
  }

  if (parsed.surface.deps.length > 0) {
    lines.push(`Injected dependencies:`);
    for (const d of parsed.surface.deps) {
      lines.push(`  - ${d.name}: ${d.type} (via ${d.via})`);
    }
    lines.push('');
  }

  lines.push(
    `Generate a focused Jest test suite covering the surface above. Return only the cases[] array — the renderer assembles the rest.`,
  );

  return lines.join('\n');
}
