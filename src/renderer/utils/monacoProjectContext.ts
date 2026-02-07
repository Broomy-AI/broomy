import * as monaco from 'monaco-editor'

let currentProjectRoot: string | null = null
let currentDisposables: monaco.IDisposable[] = []

// Map tsconfig string values to Monaco TypeScript enums
function mapCompilerOptions(opts: Record<string, unknown>, projectRoot: string): monaco.languages.typescript.CompilerOptions {
  const ts = monaco.languages.typescript

  const targetMap: Record<string, monaco.languages.typescript.ScriptTarget> = {
    es3: ts.ScriptTarget.ES3,
    es5: ts.ScriptTarget.ES5,
    es6: ts.ScriptTarget.ES2015,
    es2015: ts.ScriptTarget.ES2015,
    es2016: ts.ScriptTarget.ES2016,
    es2017: ts.ScriptTarget.ES2017,
    es2018: ts.ScriptTarget.ES2018,
    es2019: ts.ScriptTarget.ES2019,
    es2020: ts.ScriptTarget.ES2020,
    esnext: ts.ScriptTarget.ESNext,
    latest: ts.ScriptTarget.Latest,
  }

  const moduleMap: Record<string, monaco.languages.typescript.ModuleKind> = {
    none: ts.ModuleKind.None,
    commonjs: ts.ModuleKind.CommonJS,
    amd: ts.ModuleKind.AMD,
    umd: ts.ModuleKind.UMD,
    system: ts.ModuleKind.System,
    es6: ts.ModuleKind.ES2015,
    es2015: ts.ModuleKind.ES2015,
    es2020: ts.ModuleKind.ES2015, // closest available
    es2022: ts.ModuleKind.ES2015,
    esnext: ts.ModuleKind.ESNext,
    node16: ts.ModuleKind.ESNext,
    nodenext: ts.ModuleKind.ESNext,
    preserve: ts.ModuleKind.ESNext,
  }

  const moduleResolutionMap: Record<string, monaco.languages.typescript.ModuleResolutionKind> = {
    classic: ts.ModuleResolutionKind.Classic,
    node: ts.ModuleResolutionKind.NodeJs,
    node10: ts.ModuleResolutionKind.NodeJs,
    node16: ts.ModuleResolutionKind.NodeJs,
    nodenext: ts.ModuleResolutionKind.NodeJs,
    bundler: ts.ModuleResolutionKind.NodeJs,
  }

  const jsxMap: Record<string, monaco.languages.typescript.JsxEmit> = {
    none: ts.JsxEmit.None,
    preserve: ts.JsxEmit.Preserve,
    react: ts.JsxEmit.React,
    'react-jsx': ts.JsxEmit.ReactJSX,
    'react-jsxdev': ts.JsxEmit.ReactJSXDev,
    'react-native': ts.JsxEmit.ReactNative,
  }

  const result: monaco.languages.typescript.CompilerOptions = {
    // allowNonTsExtensions is required for typescriptDefaults — Monaco's editor
    // models use inmemory://model/N URIs (no .ts extension), so without this flag
    // the TS service throws "Could not find source file: 'inmemory://model/1'".
    allowNonTsExtensions: true,
    allowJs: true,
  }

  if (typeof opts.target === 'string') {
    result.target = targetMap[opts.target.toLowerCase()] ?? ts.ScriptTarget.ES2020
  }
  if (typeof opts.module === 'string') {
    result.module = moduleMap[opts.module.toLowerCase()] ?? ts.ModuleKind.ESNext
  }
  if (typeof opts.moduleResolution === 'string') {
    result.moduleResolution = moduleResolutionMap[opts.moduleResolution.toLowerCase()] ?? ts.ModuleResolutionKind.NodeJs
  }
  if (typeof opts.jsx === 'string') {
    result.jsx = jsxMap[opts.jsx.toLowerCase()] ?? ts.JsxEmit.ReactJSX
  }
  if (typeof opts.strict === 'boolean') result.strict = opts.strict
  if (typeof opts.esModuleInterop === 'boolean') result.esModuleInterop = opts.esModuleInterop
  if (typeof opts.allowSyntheticDefaultImports === 'boolean') result.allowSyntheticDefaultImports = opts.allowSyntheticDefaultImports
  if (typeof opts.resolveJsonModule === 'boolean') result.resolveJsonModule = opts.resolveJsonModule
  if (typeof opts.skipLibCheck === 'boolean') result.skipLibCheck = opts.skipLibCheck
  if (typeof opts.noEmit === 'boolean') result.noEmit = opts.noEmit
  if (typeof opts.isolatedModules === 'boolean') result.isolatedModules = opts.isolatedModules
  if (typeof opts.baseUrl === 'string') {
    // Resolve baseUrl relative to projectRoot as a plain absolute path.
    // @monaco-editor/react uses Uri.parse(path) which produces URIs with no scheme,
    // so everything (baseUrl, extra lib paths) must use plain paths to match.
    if (opts.baseUrl === '.' || opts.baseUrl === './') {
      result.baseUrl = projectRoot
    } else if ((opts.baseUrl as string).startsWith('/')) {
      result.baseUrl = opts.baseUrl
    } else {
      result.baseUrl = `${projectRoot}/${opts.baseUrl}`
    }
  }
  if (opts.paths && typeof opts.paths === 'object') {
    result.paths = opts.paths as Record<string, string[]>
  }

  return result
}

export async function loadMonacoProjectContext(projectRoot: string): Promise<void> {
  if (projectRoot === currentProjectRoot) return

  // Dispose previous extra libs
  for (const d of currentDisposables) {
    d.dispose()
  }
  currentDisposables = []
  currentProjectRoot = projectRoot

  try {
    const ctx = await window.ts.getProjectContext(projectRoot)

    const compilerOptions = mapCompilerOptions(ctx.compilerOptions, projectRoot)

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)

    // Disable JavaScript semantic validation — when we load TS project files as
    // extra libs, the JS language service can produce false "Type annotations can
    // only be used in TypeScript files" errors. Syntax highlighting and basic
    // editing for JS files still work; only semantic diagnostics are suppressed.
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
    })

    // Only add files to typescriptDefaults — adding .ts files to javascriptDefaults
    // causes the JS language service to try to parse them as JavaScript.
    // Use plain absolute paths (no file:// scheme) to match the model URI format
    // that @monaco-editor/react creates via Uri.parse(path).
    for (const file of ctx.files) {
      const uri = `${projectRoot}/${file.path}`
      const d = monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, uri)
      currentDisposables.push(d)
    }
  } catch {
    // Silently ignore — project context is best-effort
  }
}

export function clearMonacoProjectContext(): void {
  for (const d of currentDisposables) {
    d.dispose()
  }
  currentDisposables = []
  currentProjectRoot = null
}
