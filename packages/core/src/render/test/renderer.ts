/**
 * TestRenderer — pure function: TestPlan → Jest `.spec.ts` source string.
 *
 * Deterministic. Goldenable. No file I/O. No path module — uses string ops
 * so this file is browser-safe (the Chrome bundle excludes it for other
 * reasons but importing it cross-platform shouldn't fail).
 *
 * Output structure:
 *   1. import block — Angular testing helpers + the component + per-case extras
 *   2. describe(ComponentName, () => { ... })
 *      a. let fixture / component / element declarations
 *      b. beforeEach: TestBed.configureTestingModule + createComponent
 *      c. it(...) blocks, one per TestCase, body assembled from arrange/act/assert
 */
import type { InjectedDep, TestPlan } from '../../types/analysis.js';

const ANGULAR_TESTING_DEFAULT_IMPORTS = ['ComponentFixture', 'TestBed'];

/** Common Angular DI tokens that resolve to standard test providers. */
const STANDARD_DEP_PROVIDERS: Record<
  string,
  { provider: string; importFrom: string; importNames: string[] }
> = {
  HttpClient: {
    provider: 'provideHttpClient(), provideHttpClientTesting()',
    importFrom: '@angular/common/http/testing',
    importNames: ['provideHttpClientTesting'],
  },
  Router: {
    provider: 'provideRouter([])',
    importFrom: '@angular/router',
    importNames: ['provideRouter'],
  },
};

export function renderTestPlan(plan: TestPlan): string {
  const lines: string[] = [];
  const imports = collectImports(plan);
  const componentImport = relativeComponentImport(plan.unit.filePath);
  const componentName = plan.unit.name;

  // --- import block ---------------------------------------------------------
  lines.push(
    `import { ${[...imports.angularTesting].sort().join(', ')} } from '@angular/core/testing';`,
  );

  // Standard provider imports (HttpClient testing, Router, etc.)
  const sortedFromOther = [...imports.fromOther.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [from, names] of sortedFromOther) {
    lines.push(`import { ${[...names].sort().join(', ')} } from '${from}';`);
  }
  lines.push(`import { ${componentName} } from '${componentImport}';`);
  lines.push('');

  // --- describe -------------------------------------------------------------
  lines.push(`describe('${componentName}', () => {`);
  lines.push(`  let fixture: ComponentFixture<${componentName}>;`);
  lines.push(`  let component: ${componentName};`);
  lines.push(`  let element: HTMLElement;`);
  lines.push('');

  // --- beforeEach -----------------------------------------------------------
  lines.push(`  beforeEach(async () => {`);
  lines.push(`    await TestBed.configureTestingModule({`);
  lines.push(`      imports: [${componentName}],`);
  if (imports.providers.length > 0) {
    lines.push(`      providers: [`);
    for (const p of imports.providers) {
      lines.push(`        ${p},`);
    }
    lines.push(`      ],`);
  }
  lines.push(`    }).compileComponents();`);
  lines.push('');
  lines.push(`    fixture = TestBed.createComponent(${componentName});`);
  lines.push(`    component = fixture.componentInstance;`);
  lines.push(`    element = fixture.nativeElement;`);
  lines.push(`    fixture.detectChanges();`);
  lines.push(`  });`);
  lines.push('');

  // --- it blocks ------------------------------------------------------------
  for (const tc of plan.cases) {
    lines.push(`  it(${quote(tc.name)}, () => {`);
    appendIndentedFragment(lines, '// arrange', '    ');
    appendIndentedFragment(lines, tc.arrange, '    ');
    appendIndentedFragment(lines, '// act', '    ');
    appendIndentedFragment(lines, tc.act, '    ');
    appendIndentedFragment(lines, '// assert', '    ');
    appendIndentedFragment(lines, tc.assert, '    ');
    lines.push(`  });`);
    lines.push('');
  }

  lines.push(`});`);
  lines.push(''); // trailing newline

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Imports + providers collection
// ---------------------------------------------------------------------------

interface CollectedImports {
  angularTesting: Set<string>;
  /** Map of `from-module` → set of named imports. */
  fromOther: Map<string, Set<string>>;
  providers: string[];
}

function collectImports(plan: TestPlan): CollectedImports {
  const angularTesting = new Set<string>(ANGULAR_TESTING_DEFAULT_IMPORTS);
  const fromOther = new Map<string, Set<string>>();
  const providers: string[] = [];
  const seenStandardDeps = new Set<string>();

  // Per-case extra imports (named, not from-aware — caller-supplied list goes
  // into `@angular/core/testing` since most TestCase imports refer to those
  // helpers — `By`, `DebugElement`, etc. would need this expanded if tests
  // start needing imports from other paths; v1 keeps it simple).
  for (const tc of plan.cases) {
    if (!tc.imports) continue;
    for (const name of tc.imports) {
      angularTesting.add(name);
    }
  }

  // Standard DI mocks
  for (const dep of plan.surface.deps) {
    const standard = STANDARD_DEP_PROVIDERS[stripModifiers(dep.type)];
    if (!standard || seenStandardDeps.has(dep.type)) continue;
    seenStandardDeps.add(dep.type);
    addImports(fromOther, standard.importFrom, standard.importNames);
    providers.push(standard.provider);
  }

  // Generic mocks for everything else — `provideMock(SomeService)` placeholder
  // pattern would need a runtime helper. For v1, emit a `useValue` stub so
  // TestBed can satisfy the DI without touching the real service.
  for (const dep of plan.surface.deps) {
    const cleanType = stripModifiers(dep.type);
    if (STANDARD_DEP_PROVIDERS[cleanType]) continue;
    if (cleanType === 'unknown' || isPrimitive(cleanType)) continue;
    providers.push(`{ provide: ${cleanType}, useValue: ${stubObjectFor(cleanType)} }`);
    // Caller is responsible for providing a real import path — the renderer
    // doesn't know where `SomeService` comes from. Emit a TODO comment.
    addImports(fromOther, `// TODO: import { ${cleanType} } from '...';`, []);
  }

  // Standard test providers that always make sense for components
  if (plan.surface.deps.length > 0 && providers.length === 0) {
    // No mockable deps — leave providers array empty.
  }

  return { angularTesting, fromOther, providers };
}

function addImports(map: Map<string, Set<string>>, from: string, names: string[]): void {
  if (names.length === 0) return;
  const existing = map.get(from);
  if (existing) {
    for (const n of names) existing.add(n);
  } else {
    map.set(from, new Set(names));
  }
}

function stripModifiers(type: string): string {
  // `private foo: FooService` → `FooService`. Remove generics for matching.
  return type
    .replace(/^.*\s+/, '')
    .replace(/<.*>/, '')
    .trim();
}

function isPrimitive(type: string): boolean {
  return ['string', 'number', 'boolean', 'any', 'void', 'never', 'unknown'].includes(type);
}

function stubObjectFor(_type: string): string {
  // v1 generic stub. M2-followup or M3 will refine this with method-name
  // introspection so we generate jest.fn() spies for known methods.
  return '{}';
}

// ---------------------------------------------------------------------------
// File-path helpers (no Node `path` import — keeps the file browser-safe)
// ---------------------------------------------------------------------------

function relativeComponentImport(filePath: string): string {
  const fileName = filePath.replace(/^.*[\\/]/, '');
  const baseName = fileName.replace(/\.ts$/, '');
  return `./${baseName}`;
}

// ---------------------------------------------------------------------------
// Tiny code-gen helpers
// ---------------------------------------------------------------------------

function quote(s: string): string {
  // Single-quote with escape for embedded quotes; matches the rest of the codebase.
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function appendIndentedFragment(lines: string[], fragment: string, indent: string): void {
  if (!fragment.trim()) return;
  for (const line of fragment.split('\n')) {
    lines.push(line.trim() ? `${indent}${line}` : '');
  }
}

// Re-export the unused-dep type so this module compiles cleanly even if a
// future caller wants to use it. (TS doesn't error on unused type imports
// but flagging it here is the seam.)
export type { InjectedDep };
