/**
 * Golden tests for renderTestPlan — hand-written TestPlan fixtures →
 * snapshot the emitted Jest `.spec.ts` source. No LLM in the loop;
 * these tests pin renderer behavior independently of analyzer behavior.
 */
import { describe, it, expect } from 'vitest';
import { renderTestPlan } from '../../../src/index.js';
import type { TestPlan } from '../../../src/index.js';

const minimalPresentationalPlan: TestPlan = {
  unit: { kind: 'component', name: 'Greeter', filePath: 'src/app/greeter.component.ts' },
  surface: {
    inputs: [{ name: 'name', type: 'string', required: false, isSignal: false }],
    outputs: [],
    publicMethods: [],
    lifecycle: [],
    deps: [],
  },
  cases: [
    {
      name: 'projects the name input into the rendered greeting',
      arrange: `component.name = 'World';`,
      act: `fixture.detectChanges();`,
      assert: `expect(element.textContent).toContain('Hello, World');`,
    },
  ],
  framework: 'jest',
  styleHints: { useStandalone: true, useSignals: false, useInject: false },
};

describe('renderTestPlan — minimal presentational component', () => {
  const rendered = renderTestPlan(minimalPresentationalPlan);

  it('imports ComponentFixture and TestBed from @angular/core/testing', () => {
    expect(rendered).toContain(
      `import { ComponentFixture, TestBed } from '@angular/core/testing';`,
    );
  });

  it('imports the component from its relative path (no .ts extension)', () => {
    expect(rendered).toContain(`import { Greeter } from './greeter.component';`);
  });

  it('puts the component in TestBed imports[]', () => {
    expect(rendered).toContain(`imports: [Greeter]`);
  });

  it('declares fixture, component, element', () => {
    expect(rendered).toContain(`let fixture: ComponentFixture<Greeter>;`);
    expect(rendered).toContain(`let component: Greeter;`);
    expect(rendered).toContain(`let element: HTMLElement;`);
  });

  it('emits the case body with arrange/act/assert comments', () => {
    expect(rendered).toContain(`it('projects the name input into the rendered greeting', () => {`);
    expect(rendered).toContain(`// arrange`);
    expect(rendered).toContain(`component.name = 'World';`);
    expect(rendered).toContain(`// act`);
    expect(rendered).toContain(`fixture.detectChanges();`);
    expect(rendered).toContain(`// assert`);
    expect(rendered).toContain(`expect(element.textContent).toContain('Hello, World');`);
  });

  it('omits providers[] when there are no deps', () => {
    expect(rendered).not.toContain('providers:');
  });
});

describe('renderTestPlan — service-injecting component (HttpClient + Router)', () => {
  const plan: TestPlan = {
    unit: { kind: 'component', name: 'UserList', filePath: 'src/app/users/user-list.component.ts' },
    surface: {
      inputs: [],
      outputs: [],
      publicMethods: [{ name: 'load', signature: '() => void' }],
      lifecycle: ['ngOnInit'],
      deps: [
        { name: 'http', type: 'HttpClient', via: 'inject' },
        { name: 'router', type: 'Router', via: 'inject' },
      ],
    },
    cases: [
      {
        name: 'invokes http.get on init',
        arrange: ``,
        act: ``,
        assert: `expect(component).toBeTruthy();`,
      },
    ],
    framework: 'jest',
    styleHints: { useStandalone: true, useSignals: false, useInject: true },
  };

  const rendered = renderTestPlan(plan);

  it('imports provideHttpClientTesting from @angular/common/http/testing', () => {
    expect(rendered).toContain(
      `import { provideHttpClientTesting } from '@angular/common/http/testing';`,
    );
  });

  it('imports provideRouter from @angular/router', () => {
    expect(rendered).toContain(`import { provideRouter } from '@angular/router';`);
  });

  it('emits the standard providers in TestBed setup', () => {
    expect(rendered).toContain(`provideHttpClient(), provideHttpClientTesting()`);
    expect(rendered).toContain(`provideRouter([])`);
  });
});

describe('renderTestPlan — generic deps get useValue stubs', () => {
  const plan: TestPlan = {
    unit: { kind: 'component', name: 'Foo', filePath: 'foo.component.ts' },
    surface: {
      inputs: [],
      outputs: [],
      publicMethods: [],
      lifecycle: [],
      deps: [{ name: 'svc', type: 'CustomService', via: 'inject' }],
    },
    cases: [{ name: 'x', arrange: '', act: '', assert: 'expect(true).toBe(true);' }],
    framework: 'jest',
    styleHints: { useStandalone: true, useSignals: false, useInject: true },
  };

  const rendered = renderTestPlan(plan);

  it('emits a useValue stub provider for non-standard deps', () => {
    expect(rendered).toContain(`{ provide: CustomService, useValue: {} }`);
  });
});

describe('renderTestPlan — file path normalization', () => {
  it.each([
    ['src/app/foo.component.ts', './foo.component'],
    ['/absolute/path/to/bar.component.ts', './bar.component'],
    ['baz.component.ts', './baz.component'],
    [String.raw`C:\Users\dev\proj\widget.component.ts`, './widget.component'],
  ])('%s → %s', (filePath, expectedImport) => {
    const plan: TestPlan = {
      unit: { kind: 'component', name: 'X', filePath },
      surface: { inputs: [], outputs: [], publicMethods: [], lifecycle: [], deps: [] },
      cases: [{ name: 'x', arrange: '', act: '', assert: 'expect(true).toBe(true);' }],
      framework: 'jest',
      styleHints: { useStandalone: true, useSignals: false, useInject: false },
    };
    expect(renderTestPlan(plan)).toContain(`import { X } from '${expectedImport}';`);
  });
});

describe('renderTestPlan — full snapshot for the minimal case', () => {
  it('matches the canonical layout', () => {
    expect(renderTestPlan(minimalPresentationalPlan)).toMatchInlineSnapshot(`
      "import { ComponentFixture, TestBed } from '@angular/core/testing';
      import { Greeter } from './greeter.component';

      describe('Greeter', () => {
        let fixture: ComponentFixture<Greeter>;
        let component: Greeter;
        let element: HTMLElement;

        beforeEach(async () => {
          await TestBed.configureTestingModule({
            imports: [Greeter],
          }).compileComponents();

          fixture = TestBed.createComponent(Greeter);
          component = fixture.componentInstance;
          element = fixture.nativeElement;
          fixture.detectChanges();
        });

        it('projects the name input into the rendered greeting', () => {
          // arrange
          component.name = 'World';
          // act
          fixture.detectChanges();
          // assert
          expect(element.textContent).toContain('Hello, World');
        });

      });
      "
    `);
  });
});
