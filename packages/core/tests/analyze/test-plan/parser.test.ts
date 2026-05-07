/**
 * Tests for the ts-morph-based TestPlanAnalyzer parser.
 *
 * Uses parseComponentSurfaceFromText so fixtures are inlined here rather than
 * scattered as separate .ts files. Each fixture exercises a different
 * extraction concern: decorator inputs, signal inputs, mixed deps, lifecycle.
 */
import { describe, it, expect } from 'vitest';
import { parseComponentSurfaceFromText } from '../../../src/index.js';

describe('parseComponentSurfaceFromText — decorator-based component', () => {
  const source = `
    import { Component, Input, Output, EventEmitter } from '@angular/core';

    @Component({
      selector: 'app-decorator-button',
      standalone: true,
      template: '<button (click)="press()">{{label}}</button>',
    })
    export class DecoratorButtonComponent {
      @Input() label = 'OK';
      @Input({ required: true }) variant!: 'primary' | 'secondary';
      @Output() pressed = new EventEmitter<MouseEvent>();

      press(): void {
        this.pressed.emit(new MouseEvent('click'));
      }

      private internal(): void {}

      ngOnInit(): void {}
    }
  `;

  const parsed = parseComponentSurfaceFromText('decorator-button.component.ts', source);

  it('finds the component', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.unit).toEqual({
      kind: 'component',
      name: 'DecoratorButtonComponent',
      filePath: 'decorator-button.component.ts',
    });
  });

  it('extracts decorator inputs and the required flag', () => {
    const inputs = parsed!.surface.inputs;
    expect(inputs).toHaveLength(2);
    expect(inputs.find((i) => i.name === 'label')).toMatchObject({
      isSignal: false,
      required: false,
    });
    expect(inputs.find((i) => i.name === 'variant')).toMatchObject({
      isSignal: false,
      required: true,
    });
  });

  it('extracts decorator outputs and unwraps EventEmitter<T>', () => {
    expect(parsed!.surface.outputs).toEqual([
      { name: 'pressed', emitsType: 'MouseEvent', isSignalOutput: false },
    ]);
  });

  it('skips private methods and lifecycle hooks from publicMethods', () => {
    const names = parsed!.surface.publicMethods.map((m) => m.name);
    expect(names).toEqual(['press']);
  });

  it('captures lifecycle hooks separately', () => {
    expect(parsed!.surface.lifecycle).toEqual(['ngOnInit']);
  });

  it('sets styleHints based on what was used', () => {
    expect(parsed!.styleHints).toEqual({
      useStandalone: true,
      useSignals: false,
      useInject: false,
    });
  });
});

describe('parseComponentSurfaceFromText — signal-based component', () => {
  const source = `
    import { Component, input, output, inject } from '@angular/core';
    import { HttpClient } from '@angular/common/http';

    @Component({
      selector: 'app-signal-form',
      standalone: true,
      template: '',
    })
    export class SignalFormComponent {
      label = input<string>('Submit');
      max = input.required<number>();
      submitted = output<{ payload: string }>();
      private http = inject(HttpClient);

      submit(payload: string): void {
        this.submitted.emit({ payload });
      }
    }
  `;

  const parsed = parseComponentSurfaceFromText('signal-form.component.ts', source);

  it('extracts signal inputs with required flag', () => {
    const inputs = parsed!.surface.inputs;
    expect(inputs).toHaveLength(2);
    expect(inputs.find((i) => i.name === 'label')).toMatchObject({
      isSignal: true,
      required: false,
      type: 'string',
    });
    expect(inputs.find((i) => i.name === 'max')).toMatchObject({
      isSignal: true,
      required: true,
      type: 'number',
    });
  });

  it('extracts signal outputs', () => {
    expect(parsed!.surface.outputs).toEqual([
      { name: 'submitted', emitsType: '{ payload: string }', isSignalOutput: true },
    ]);
  });

  it('extracts inject() dependencies', () => {
    expect(parsed!.surface.deps).toEqual([{ name: 'http', type: 'HttpClient', via: 'inject' }]);
  });

  it('sets styleHints.useSignals + useInject', () => {
    expect(parsed!.styleHints).toEqual({
      useStandalone: true,
      useSignals: true,
      useInject: true,
    });
  });
});

describe('parseComponentSurfaceFromText — constructor DI', () => {
  const source = `
    import { Component } from '@angular/core';
    import { Router } from '@angular/router';
    import { UserService } from './user.service';

    @Component({ selector: 'app-x', standalone: true, template: '' })
    export class XComponent {
      constructor(
        private router: Router,
        public userService: UserService,
      ) {}

      navigate(): void {
        this.router.navigate(['/home']);
      }
    }
  `;

  const parsed = parseComponentSurfaceFromText('x.component.ts', source);

  it('extracts constructor parameter deps', () => {
    expect(parsed!.surface.deps).toEqual([
      { name: 'router', type: 'Router', via: 'constructor' },
      { name: 'userService', type: 'UserService', via: 'constructor' },
    ]);
  });

  it('useInject is false when only constructor DI is used', () => {
    expect(parsed!.styleHints.useInject).toBe(false);
  });
});

describe('parseComponentSurfaceFromText — non-component files', () => {
  it('returns null for a service-only file', () => {
    const source = `
      import { Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class FooService {
        get(): string { return 'x'; }
      }
    `;
    expect(parseComponentSurfaceFromText('foo.service.ts', source)).toBeNull();
  });

  it('returns null for an empty file', () => {
    expect(parseComponentSurfaceFromText('empty.ts', '')).toBeNull();
  });
});

describe('parseComponentSurfaceFromText — standalone defaults', () => {
  it('treats omitted standalone as standalone:true (Angular 19+ default)', () => {
    const source = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-d', template: '' })
      export class DComponent {}
    `;
    const parsed = parseComponentSurfaceFromText('d.component.ts', source);
    expect(parsed!.styleHints.useStandalone).toBe(true);
  });

  it('respects explicit standalone: false', () => {
    const source = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-l', standalone: false, template: '' })
      export class LComponent {}
    `;
    const parsed = parseComponentSurfaceFromText('l.component.ts', source);
    expect(parsed!.styleHints.useStandalone).toBe(false);
  });
});
