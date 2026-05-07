/**
 * ts-morph-based parser for Angular 19+ standalone components.
 *
 * Extracts the component's typed surface — name, selector, inputs (decorator
 * + signal forms), outputs (decorator + signal forms), public methods,
 * lifecycle hooks, and injected dependencies (inject() + constructor DI).
 *
 * Returns `null` if the file contains no @Component class.
 *
 * Scope (M2): components only. Services/directives/pipes use the same
 * surface shape but require their own decorator handling — deferred.
 */
import { Node, Project, type ClassDeclaration, type Decorator, type SourceFile } from 'ts-morph';
import type {
  InjectedDep,
  LifecycleHook,
  SurfaceInput,
  SurfaceMethod,
  SurfaceOutput,
  TestPlan,
} from '../../types/analysis.js';

const LIFECYCLE_HOOK_NAMES = new Set<LifecycleHook>([
  'ngOnInit',
  'ngOnDestroy',
  'ngOnChanges',
  'ngAfterViewInit',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewChecked',
  'ngDoCheck',
]);

export interface ParsedComponentSurface {
  unit: TestPlan['unit'];
  surface: TestPlan['surface'];
  styleHints: TestPlan['styleHints'];
}

export function parseComponentSurface(filePath: string): ParsedComponentSurface | null {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return extractFromSource(sourceFile, filePath);
}

/**
 * Variant for tests / fixtures that pre-load source text rather than read from disk.
 */
export function parseComponentSurfaceFromText(
  fileName: string,
  source: string,
): ParsedComponentSurface | null {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(fileName, source, { overwrite: true });
  return extractFromSource(sourceFile, fileName);
}

function extractFromSource(
  sourceFile: SourceFile,
  filePath: string,
): ParsedComponentSurface | null {
  const componentClass = sourceFile
    .getClasses()
    .find((cls) => cls.getDecorator('Component') != null);

  if (!componentClass) return null;

  const componentDecorator = componentClass.getDecoratorOrThrow('Component');
  const metadataObject = getDecoratorMetadataObject(componentDecorator);

  const inputs = extractInputs(componentClass);
  const outputs = extractOutputs(componentClass);
  const publicMethods = extractPublicMethods(componentClass);
  const lifecycle = extractLifecycle(componentClass);
  const deps = extractInjectedDeps(componentClass);

  const useStandalone = readBooleanProp(metadataObject, 'standalone') !== false; // default true in Angular 19+
  const useSignals = inputs.some((i) => i.isSignal) || outputs.some((o) => o.isSignalOutput);
  const useInject = deps.some((d) => d.via === 'inject');

  return {
    unit: {
      kind: 'component',
      name: componentClass.getName() ?? 'AnonymousComponent',
      filePath,
    },
    surface: {
      inputs,
      outputs,
      publicMethods,
      lifecycle,
      deps,
    },
    styleHints: { useStandalone, useSignals, useInject },
  };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function extractInputs(cls: ClassDeclaration): SurfaceInput[] {
  const inputs: SurfaceInput[] = [];

  for (const prop of cls.getProperties()) {
    const decorator = prop.getDecorator('Input');
    if (decorator) {
      // @Input() name: string  /  @Input({ required: true }) name: string
      inputs.push({
        name: prop.getName(),
        type: prop.getType().getText(prop) || 'unknown',
        required: getRequiredFromInputDecorator(decorator),
        isSignal: false,
      });
      continue;
    }

    const signalCall = readSignalFactoryCall(prop, ['input']);
    if (signalCall) {
      // foo = input<string>('default')  /  foo = input.required<string>()
      inputs.push({
        name: prop.getName(),
        type: signalCall.typeArg ?? 'unknown',
        required: signalCall.required,
        isSignal: true,
      });
    }
  }

  return inputs;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

function extractOutputs(cls: ClassDeclaration): SurfaceOutput[] {
  const outputs: SurfaceOutput[] = [];

  for (const prop of cls.getProperties()) {
    const decorator = prop.getDecorator('Output');
    if (decorator) {
      // @Output() saved = new EventEmitter<MyType>()
      // Type resolution may fail without Angular's types loaded, so prefer
      // parsing the initializer text — it's source-faithful regardless.
      const fromInitializer = readEventEmitterGenericFromInitializer(prop);
      const fromTypeAnnotation = prop.getTypeNode()?.getText();
      const emitsType =
        fromInitializer ??
        (fromTypeAnnotation ? unwrapEventEmitterType(fromTypeAnnotation) : 'unknown');
      outputs.push({
        name: prop.getName(),
        emitsType,
        isSignalOutput: false,
      });
      continue;
    }

    const signalCall = readSignalFactoryCall(prop, ['output']);
    if (signalCall) {
      // saved = output<MyType>()
      outputs.push({
        name: prop.getName(),
        emitsType: signalCall.typeArg ?? 'void',
        isSignalOutput: true,
      });
    }
  }

  return outputs;
}

function unwrapEventEmitterType(typeText: string): string {
  // EventEmitter<T> → T; fallback to the raw text if no generic
  const match = typeText.match(/EventEmitter<(.+)>/);
  return match?.[1]?.trim() ?? typeText;
}

function readEventEmitterGenericFromInitializer(
  prop: ReturnType<ClassDeclaration['getProperties']>[number],
): string | null {
  const initializer = prop.getInitializer();
  if (!initializer) return null;
  // Matches `new EventEmitter<...>(...)`; balanced angle brackets up to the next `>(`.
  const match = initializer.getText().match(/^new\s+EventEmitter<(.+)>\s*\(/);
  return match?.[1]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Methods + lifecycle
// ---------------------------------------------------------------------------

function extractPublicMethods(cls: ClassDeclaration): SurfaceMethod[] {
  return cls
    .getMethods()
    .filter((m) => {
      const name = m.getName();
      if (LIFECYCLE_HOOK_NAMES.has(name as LifecycleHook)) return false;
      if (m.hasModifier('private') || m.hasModifier('protected')) return false;
      return true;
    })
    .map((m) => ({
      name: m.getName(),
      signature: getMethodSignature(m),
    }));
}

function getMethodSignature(m: ReturnType<ClassDeclaration['getMethods']>[number]): string {
  const params = m
    .getParameters()
    .map((p) => `${p.getName()}: ${p.getType().getText(p)}`)
    .join(', ');
  const returnType = m.getReturnType().getText(m);
  return `(${params}) => ${returnType}`;
}

function extractLifecycle(cls: ClassDeclaration): LifecycleHook[] {
  const hooks: LifecycleHook[] = [];
  for (const m of cls.getMethods()) {
    const name = m.getName();
    if (LIFECYCLE_HOOK_NAMES.has(name as LifecycleHook)) {
      hooks.push(name as LifecycleHook);
    }
  }
  return hooks;
}

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

function extractInjectedDeps(cls: ClassDeclaration): InjectedDep[] {
  const deps: InjectedDep[] = [];

  // inject() pattern: field initializer is a call to `inject(Token)`.
  for (const prop of cls.getProperties()) {
    const initializer = prop.getInitializer();
    if (!initializer) continue;
    const callText = initializer.getText();
    const injectMatch = callText.match(/^inject\(\s*([\w.]+)/);
    if (injectMatch) {
      deps.push({
        name: prop.getName(),
        type: injectMatch[1] ?? 'unknown',
        via: 'inject',
      });
    }
  }

  // Constructor parameter DI
  const ctor = cls.getConstructors()[0];
  if (ctor) {
    for (const param of ctor.getParameters()) {
      deps.push({
        name: param.getName(),
        type: param.getType().getText(param) || 'unknown',
        via: 'constructor',
      });
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Decorator metadata helpers
// ---------------------------------------------------------------------------

function getDecoratorMetadataObject(decorator: Decorator): { properties: Map<string, string> } {
  // We only need to read a small set of literal-valued props (selector, standalone).
  // Full metadata-object parsing is overkill; pull what we need by name.
  const properties = new Map<string, string>();
  const arg = decorator.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return { properties };

  for (const prop of arg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const name = prop.getName();
    properties.set(name, prop.getInitializer()?.getText() ?? '');
  }
  return { properties };
}

function getRequiredFromInputDecorator(decorator: Decorator): boolean {
  // @Input() → not required; @Input({ required: true }) → required.
  const arg = decorator.getArguments()[0];
  if (!arg || !Node.isObjectLiteralExpression(arg)) return false;
  for (const prop of arg.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    if (prop.getName() === 'required' && prop.getInitializer()?.getText() === 'true') {
      return true;
    }
  }
  return false;
}

function readBooleanProp(
  metadata: { properties: Map<string, string> },
  key: string,
): boolean | undefined {
  const text = metadata.properties.get(key);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Signal-factory call detection (input(), output(), input.required(), etc.)
// ---------------------------------------------------------------------------

interface SignalFactoryCall {
  typeArg: string | undefined;
  required: boolean;
}

function readSignalFactoryCall(
  prop: ReturnType<ClassDeclaration['getProperties']>[number],
  factoryNames: string[],
): SignalFactoryCall | null {
  const initializer = prop.getInitializer();
  if (!initializer) return null;
  const text = initializer.getText();

  for (const name of factoryNames) {
    // matches: name(...), name<T>(...), name.required(...), name.required<T>(...)
    const re = new RegExp(`^${name}(?:\\.required)?(?:<([^>]+)>)?\\s*\\(`);
    const match = text.match(re);
    if (match) {
      return {
        typeArg: match[1]?.trim(),
        required: text.startsWith(`${name}.required`),
      };
    }
  }

  return null;
}
