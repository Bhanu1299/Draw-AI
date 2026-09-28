# M1: Board + Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app with an infinite whiteboard where you draw a wireframe (or drop a screenshot), click **Build**, and a live React + Tailwind page appears next to it as a frame on the board. Every element in the page carries a hidden `data-src` tag pointing to its source line.

**Architecture:**
- **The board:** a Next.js app hosts a tldraw board with a custom `drawai-frame` shape.
- **The frame:** it stores the page's source files in its props, compiles them in the browser with `@babel/standalone`, and renders them in a sandboxed iframe with the Tailwind browser build. Babel also injects the `data-src` tags at this step.
- **Build:** a `/api/build` route sends the exported selection image to Claude, parses the `<file>` blocks it returns, and verifies them with the *same* compiler. If they don't compile, it sends the errors back once for a fix.

**Tech Stack:** Node 22 · Next.js 16.3.6 (App Router) · React 19.3.0 · tldraw 5.4.2 · @babel/standalone 7.29.9 · @anthropic-ai/sdk 0.128.0 (model `claude-opus-5`) · Tailwind browser build 4.3.3 · Vitest 5.0.2 · TypeScript 5.9.3

**Spec:** `docs/superpowers/specs/2026-09-28-drawai-v1-design.md` (this plan implements milestone M1, §11)

## Global Constraints

- Node `>=22.12` (Vitest 5 requires it; Node 20 is end-of-life). The project pins this with `.nvmrc` = `22`.
- Generated pages may import only `react`, `lucide-react` and relative files. `react/jsx-runtime` is allowed implicitly because the compiler emits it.
- The entry file is always `App.tsx`. File paths must match `folder/Name.tsx` or `Name.ts(x)` and must not contain `..`.
- Frame width is fixed at 1280px (the desktop viewport). Height follows the content, with a minimum of 200px.
- The model is `claude-opus-5`, with adaptive thinking, streaming, and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- Uploaded image cap: **5 MB** decoded. Optional note cap: **2000** characters.
- The AI key lives only on the server (`ANTHROPIC_API_KEY` in `.env.local`) and never reaches the browser.
- **M1 is local-only.** Don't deploy it: there are no auth or usage limits until M3.
- `data-src` format: `path/File.tsx:line:column`, with a 1-based column. It's added **only** in the preview, never to stored or exported files.

## Review Focus

1. **The page reloads while a build is in flight.** The frame is persisted with `status: 'building'` and would spin forever. Expected: on load it becomes an error frame that says the build was interrupted (tested in Task 7 via `findInterruptedFrames`).
2. **The model wraps code in markdown fences or adds `./` to paths.** Expected: the fences are stripped and the paths normalised, so the page still builds (tested in Task 4 `parseFiles`).
3. **The model imports a package we don't serve** (for example `framer-motion`). Expected: a compile error names the package, the retry is told about it, and a still-broken result gives a clear error instead of a blank frame (tested in Tasks 3 and 4).
4. **The user selects nothing, or selects a built frame** (iframes can't be exported to an image). Expected: a clear message and no API call (tested in Task 7 `checkSelection`).
5. **The image is huge**, for example a tall full-page screenshot. Expected: the client scales it down to fit 1600×8000, and the server rejects anything over 5 MB with a readable message (tested in Task 5 `parseBuildRequest` and Task 7 `fitScale`).

---

## File Structure

```
.nvmrc, .gitignore, .env.example, package.json, tsconfig.json, next.config.ts, vitest.config.ts
src/
  app/layout.tsx                 root HTML shell
  app/page.tsx                   client page, loads Board without SSR
  app/api/build/route.ts         POST /api/build
  shared/types.ts                ProjectFiles, BuildKind, BuildRequest, BuildResponse
  preview/                       ── the compiler (runs in browser AND on server)
    resolveImport.ts             relative import → project file path
    dataSrcPlugin.ts             Babel plugin: add data-src to HTML-level JSX
    transformFile.ts             one TSX file → CommonJS JS
    runtimeHtml.ts               compiled modules → iframe srcdoc HTML
    compileProject.ts            files → { ok, html } | { ok:false, error }
    previewMessages.ts           parse postMessage from iframe
  server/build/                  ── build pipeline (pure, testable)
    parseFiles.ts                <file> blocks + <summary> from model text
    validateProject.ts           path rules + compileProject
    prompt.ts                    system prompt, user content, fix prompt
    buildProject.ts              generate → parse → validate → retry once
    parseBuildRequest.ts         validate the POST body
  server/ai/generateWithClaude.ts  the only file that talks to Anthropic
  frame/
    frameTypes.ts                FRAME_TYPE, FrameProps, tldraw type augmentation
    FrameShapeUtil.tsx           the tldraw shape
    FramePreview.tsx             compiles + renders iframe, reports height
    sampleFiles.ts               sample project (dev button + tests)
  board/
    Board.tsx                    Tldraw + shapes + BuildBar + crash recovery
    BuildBar.tsx                 note input + Build button
    selectionHelpers.ts          checkSelection, fitScale, findInterruptedFrames
    buildFromSelection.ts        export image → POST → fill frame
```

Tests sit next to their files as `*.test.ts`.

---

### Task 1: Scaffold the project

**Files:**
- Create: `.nvmrc`, `.gitignore`, `.env.example`, `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/shared/types.ts`

**Interfaces:**
- Produces: `src/shared/types.ts`, shown in Step 4. It exports `ProjectFiles`, `BuildKind`, `BuildRequest` and `BuildResponse`, and every later task imports them from `@/shared/types`.

- [ ] **Step 1: Switch to Node 22**

Run:
```bash
source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22 && node -v
```
Expected: `v22.x.x`. Every later command in this plan assumes Node 22 is active; run `source ~/.nvm/nvm.sh && nvm use` in each new shell.

- [ ] **Step 2: Create config files**

`.nvmrc`:
```
22
```

`.gitignore`:
```
node_modules/
.next/
next-env.d.ts
.env
.env.local
.env*.local
.superpowers/
*.tsbuildinfo
```

`.env.example`:
```
# Copy to .env.local and fill in. Never commit .env.local.
ANTHROPIC_API_KEY=
```

`package.json`:
```json
{
  "name": "drawai",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`vitest.config.ts`:
```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 3: Install pinned dependencies**

Run:
```bash
npm install next@16.3.6 react@19.3.0 react-dom@19.3.0 tldraw@5.4.2 @babel/standalone@7.29.9 @anthropic-ai/sdk@0.128.0
npm install -D typescript@5.9.3 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@22 @types/babel__standalone@7.1.9 @types/babel__core vitest@5.0.2
```
Expected: both finish without `ERESOLVE` errors.

- [ ] **Step 4: Write the shared types and a minimal app shell**

`src/shared/types.ts`:
```ts
/** Map of project-relative path (e.g. "components/Hero.tsx") to file contents. */
export type ProjectFiles = Record<string, string>;

export type BuildKind = 'sketch' | 'screenshot';

export interface BuildRequest {
  kind: BuildKind;
  /** PNG image, base64 without the data: prefix. */
  imageBase64: string;
  note: string;
}

export type BuildResponse =
  | { ok: true; files: ProjectFiles; summary: string }
  | { ok: false; error: string };
```

`src/app/layout.tsx`:
```tsx
import type { ReactNode } from 'react';

export const metadata = { title: 'DrawAI' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (temporary; Task 6 replaces it):
```tsx
export default function Home() {
  return <p>DrawAI</p>;
}
```

- [ ] **Step 5: Verify the toolchain**

Run:
```bash
npm run typecheck && npx vitest run --passWithNoTests && npm run build
```
Expected: the typecheck passes, vitest reports no test files and exits 0, and `next build` ends with `✓ Compiled successfully` and lists the `/` route.

- [ ] **Step 6: Initialise git and commit**

```bash
git init
git add .
git commit -m "chore: scaffold DrawAI (Next.js, tldraw, vitest) with M1 spec and plan"
```

---

### Task 2: Compiler core: import resolution, `data-src` plugin, file transform

**Files:**
- Create: `src/preview/resolveImport.ts`, `src/preview/dataSrcPlugin.ts`, `src/preview/transformFile.ts`
- Test: `src/preview/resolveImport.test.ts`, `src/preview/transformFile.test.ts`

**Interfaces:**
- Consumes: `ProjectFiles` from `@/shared/types`
- Produces:
  - `resolveImport(fromPath: string, spec: string, files: ProjectFiles): string | null`
  - `DATA_SRC_ATTR = 'data-src'`
  - `dataSrcPlugin` (Babel plugin)
  - `transformFile(path: string, source: string, opts: { tagSources: boolean }): string`. It returns CommonJS code and throws Babel's error on a syntax error.

- [ ] **Step 1: Write the failing tests**

`src/preview/resolveImport.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveImport } from './resolveImport';

const files = {
  'App.tsx': '',
  'components/Header.tsx': '',
  'components/ui/index.tsx': '',
  'lib/utils.ts': '',
};

describe('resolveImport', () => {
  it('resolves a relative import without extension', () => {
    expect(resolveImport('App.tsx', './components/Header', files)).toBe('components/Header.tsx');
  });
  it('resolves a parent-directory import to a .ts file', () => {
    expect(resolveImport('components/Header.tsx', '../lib/utils', files)).toBe('lib/utils.ts');
  });
  it('resolves a directory to its index file', () => {
    expect(resolveImport('App.tsx', './components/ui', files)).toBe('components/ui/index.tsx');
  });
  it('keeps an explicit extension', () => {
    expect(resolveImport('App.tsx', './components/Header.tsx', files)).toBe('components/Header.tsx');
  });
  it('returns null for a missing file', () => {
    expect(resolveImport('App.tsx', './Nope', files)).toBeNull();
  });
  it('returns null for bare package names', () => {
    expect(resolveImport('App.tsx', 'react', files)).toBeNull();
  });
  it('returns null when the path escapes the project root', () => {
    expect(resolveImport('App.tsx', '../outside', files)).toBeNull();
  });
});
```

`src/preview/transformFile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { transformFile } from './transformFile';

const HEADER = [
  'import Logo from "./Logo";',
  'export default function Header(): JSX.Element {',
  '  return (',
  '    <nav className="p-4">',
  '      <a href="/">Home</a>',
  '      <Logo />',
  '    </nav>',
  '  );',
  '}',
].join('\n');

describe('transformFile', () => {
  it('compiles TSX to CommonJS with the automatic JSX runtime', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: false });
    expect(code).toContain('require("react/jsx-runtime")');
    expect(code).toContain('require("./Logo")');
    expect(code).not.toContain('<nav');
  });

  it('tags HTML-level elements with data-src path:line:column', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: true });
    expect(code).toContain('"data-src": "components/Header.tsx:4:5"');
    expect(code).toContain('"data-src": "components/Header.tsx:5:7"');
  });

  it('does not tag components (capitalised JSX)', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: true });
    expect(code.match(/"data-src"/g)).toHaveLength(2);
  });

  it('adds no tags when tagSources is false', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: false });
    expect(code).not.toContain('data-src');
  });

  it('throws a message naming the file on a syntax error', () => {
    expect(() =>
      transformFile('Bad.tsx', 'export default function A() { return <div> }', { tagSources: false }),
    ).toThrow(/Bad\.tsx/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/preview`
Expected: FAIL, "Failed to resolve import './resolveImport'" and the same for `./transformFile`.

- [ ] **Step 3: Implement**

`src/preview/resolveImport.ts`:
```ts
import type { ProjectFiles } from '@/shared/types';

const CANDIDATE_SUFFIXES = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

/** Resolve a relative import to a project file path, or null if it is a package or missing. */
export function resolveImport(fromPath: string, spec: string, files: ProjectFiles): string | null {
  if (!spec.startsWith('.')) return null;
  const slash = fromPath.lastIndexOf('/');
  const parts = slash === -1 ? [] : fromPath.slice(0, slash).split('/');
  for (const segment of spec.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  const base = parts.join('/');
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (candidate in files) return candidate;
  }
  return null;
}
```

`src/preview/dataSrcPlugin.ts`:
```ts
import type { PluginObj, PluginPass, types as BabelTypes } from '@babel/core';

export const DATA_SRC_ATTR = 'data-src';

/**
 * Adds data-src="path:line:column" to every HTML-level JSX element (lowercase tag),
 * so the canvas can map a pen mark back to the exact source line.
 */
export function dataSrcPlugin({ types: t }: { types: typeof BabelTypes }): PluginObj<PluginPass> {
  return {
    name: 'drawai-data-src',
    visitor: {
      JSXOpeningElement(path, state) {
        const name = path.node.name;
        if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return;
        const alreadyTagged = path.node.attributes.some(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === DATA_SRC_ATTR,
        );
        if (alreadyTagged || !path.node.loc) return;
        // Babel prefixes a bare filename with "/"; strip it so tags match project paths.
        const file = (state.filename ?? 'unknown').replace(/^\//, '');
        const { line, column } = path.node.loc.start;
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(DATA_SRC_ATTR), t.stringLiteral(`${file}:${line}:${column + 1}`)),
        );
      },
    },
  };
}
```

`src/preview/transformFile.ts`:
```ts
import * as Babel from '@babel/standalone';
import { dataSrcPlugin } from './dataSrcPlugin';

/** Compile one TSX/TS file to CommonJS. Throws Babel's error (message starts with the file path) on bad syntax. */
export function transformFile(path: string, source: string, opts: { tagSources: boolean }): string {
  const result = Babel.transform(source, {
    filename: path,
    sourceType: 'module',
    presets: [
      ['typescript', { isTSX: true, allExtensions: true }],
      ['react', { runtime: 'automatic' }],
    ],
    plugins: [...(opts.tagSources ? [dataSrcPlugin] : []), 'transform-modules-commonjs'],
  });
  return result.code ?? '';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/preview && npm run typecheck`
Expected: all 12 tests PASS and the typecheck is clean. If `tsc` rejects the plugin's type imports, check that `@types/babel__core` is installed. Don't use `any`.

- [ ] **Step 5: Commit**

```bash
git add src/preview
git commit -m "feat(preview): TSX compiler with data-src source tagging"
```

---

### Task 3: Compile a whole project into iframe HTML

**Files:**
- Create: `src/preview/runtimeHtml.ts`, `src/preview/compileProject.ts`, `src/preview/previewMessages.ts`, `src/frame/sampleFiles.ts`
- Test: `src/preview/runtimeHtml.test.ts`, `src/preview/compileProject.test.ts`, `src/preview/previewMessages.test.ts`

**Interfaces:**
- Consumes: `resolveImport` and `transformFile` (Task 2), and `ProjectFiles`
- Produces:
  - From `runtimeHtml.ts`:
    - `interface CompiledModule { code: string; deps: Record<string, string> }`
    - `ALLOWED_PACKAGES: string[]`
    - `PREVIEW_SOURCE = 'drawai-preview'`
    - `safeJsonForScript(value: unknown): string`
    - `buildRuntimeHtml(modules: Record<string, CompiledModule>, entry: string): string`
  - From `compileProject.ts`:
    - `ENTRY_FILE = 'App.tsx'`
    - `type CompileResult = { ok: true; html: string } | { ok: false; error: string }`
    - `compileProject(files: ProjectFiles, opts: { tagSources: boolean }): CompileResult`
  - From `previewMessages.ts`:
    - `type PreviewMessage = { type: 'height'; height: number } | { type: 'runtime-error'; message: string }`
    - `parsePreviewMessage(data: unknown): PreviewMessage | null`
  - `SAMPLE_FILES: ProjectFiles`

- [ ] **Step 1: Write the failing tests**

`src/preview/runtimeHtml.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ALLOWED_PACKAGES, buildRuntimeHtml, safeJsonForScript } from './runtimeHtml';

describe('safeJsonForScript', () => {
  it('escapes < so embedded code cannot close the script tag', () => {
    expect(safeJsonForScript({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}');
  });
});

describe('buildRuntimeHtml', () => {
  it('embeds modules without breaking out of the script tag', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: 'const s = "</script>";', deps: {} } }, 'App.tsx');
    // Only the two real closing tags: the Tailwind script and the module script.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain('\\u003c/script>');
  });

  it('loads the entry module and the Tailwind browser build', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toContain('load("App.tsx")');
    expect(html).toContain('@tailwindcss/browser@4.3.3');
  });

  it('allows exactly react, react/jsx-runtime and lucide-react', () => {
    expect([...ALLOWED_PACKAGES].sort()).toEqual(['lucide-react', 'react', 'react/jsx-runtime']);
  });
});
```

`src/preview/compileProject.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import { compileProject } from './compileProject';

const APP = 'import Header from "./components/Header";\nexport default function App() { return <main><Header /></main>; }\n';
const HEADER = 'export default function Header() { return <nav className="p-4">Hi</nav>; }\n';

describe('compileProject', () => {
  it('compiles a multi-file project and records resolved dependencies', () => {
    const result = compileProject({ 'App.tsx': APP, 'components/Header.tsx': HEADER }, { tagSources: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('"./components/Header":"components/Header.tsx"');
  });

  it('adds data-src tags when asked', () => {
    const result = compileProject({ 'App.tsx': APP, 'components/Header.tsx': HEADER }, { tagSources: true });
    expect(result.ok && result.html.includes('components/Header.tsx:1:')).toBe(true);
  });

  it('fails without App.tsx', () => {
    expect(compileProject({ 'components/Header.tsx': HEADER }, { tagSources: false })).toEqual({
      ok: false,
      error: 'Missing App.tsx',
    });
  });

  it('rejects packages the preview does not serve, naming them', () => {
    const app = 'import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }\n';
    const result = compileProject({ 'App.tsx': app }, { tagSources: false });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('framer-motion');
  });

  it('rejects a relative import to a missing file', () => {
    const result = compileProject({ 'App.tsx': APP }, { tagSources: false });
    expect(!result.ok && result.error).toContain('./components/Header');
  });

  it('reports syntax errors with the file name', () => {
    const result = compileProject({ 'App.tsx': 'export default function App() { return <div> }' }, { tagSources: false });
    expect(!result.ok && result.error).toMatch(/^App\.tsx/);
  });

  it('compiles the bundled sample project', () => {
    expect(compileProject(SAMPLE_FILES, { tagSources: true }).ok).toBe(true);
  });
});
```

`src/preview/previewMessages.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePreviewMessage } from './previewMessages';

describe('parsePreviewMessage', () => {
  it('parses a height message', () => {
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'height', height: 912 })).toEqual({
      type: 'height',
      height: 912,
    });
  });
  it('parses a runtime error', () => {
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'runtime-error', message: 'boom' })).toEqual({
      type: 'runtime-error',
      message: 'boom',
    });
  });
  it('ignores messages from other sources and malformed data', () => {
    expect(parsePreviewMessage({ source: 'other', type: 'height', height: 1 })).toBeNull();
    expect(parsePreviewMessage({ source: 'drawai-preview', type: 'height', height: 'tall' })).toBeNull();
    expect(parsePreviewMessage('hello')).toBeNull();
    expect(parsePreviewMessage(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/preview`
Expected: the Task 2 tests pass, and the new files FAIL with missing-module errors.

- [ ] **Step 3: Implement**

`src/preview/runtimeHtml.ts`:
```ts
export interface CompiledModule {
  code: string;
  /** Relative import specifier → resolved project path. */
  deps: Record<string, string>;
}

export const PREVIEW_SOURCE = 'drawai-preview';

const REACT = 'react@19.3.0';
const EXTERNAL_URLS: Record<string, string> = {
  react: `https://esm.sh/${REACT}`,
  'react/jsx-runtime': `https://esm.sh/${REACT}/jsx-runtime`,
  'lucide-react': `https://esm.sh/lucide-react@1.48.0?deps=${REACT}`,
};
const REACT_DOM_CLIENT_URL = `https://esm.sh/react-dom@19.3.0/client?deps=${REACT}`;
const TAILWIND_URL = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3';

export const ALLOWED_PACKAGES = Object.keys(EXTERNAL_URLS);

/** JSON that is safe to inline inside a <script> element. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Build the iframe srcdoc: loads externals from esm.sh, runs our CommonJS modules, renders App. */
export function buildRuntimeHtml(modules: Record<string, CompiledModule>, entry: string): string {
  const names = Object.keys(EXTERNAL_URLS);
  const externalImports = names
    .map((name, i) => `import * as ext${i} from ${JSON.stringify(EXTERNAL_URLS[name])};`)
    .join('\n');
  const externalMap = names.map((name, i) => `${JSON.stringify(name)}: ext${i}`).join(', ');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<script src="${TAILWIND_URL}"></script>
<style>html,body{margin:0;background:#fff}</style>
</head><body><div id="root"></div>
<script type="module">
${externalImports}
import { createRoot } from ${JSON.stringify(REACT_DOM_CLIENT_URL)};
const externals = { ${externalMap} };
const modules = ${safeJsonForScript(modules)};
const cache = {};
const report = (msg) => parent.postMessage({ source: ${JSON.stringify(PREVIEW_SOURCE)}, ...msg }, '*');
window.addEventListener('error', (e) => report({ type: 'runtime-error', message: String(e.message) }));
function load(path) {
  if (cache[path]) return cache[path].exports;
  const mod = modules[path];
  if (!mod) throw new Error('Module not found: ' + path);
  const module = { exports: {} };
  cache[path] = module;
  const require = (spec) => {
    if (spec in externals) return externals[spec];
    if (!(spec in mod.deps)) throw new Error('Cannot resolve "' + spec + '" from ' + path);
    return load(mod.deps[spec]);
  };
  new Function('require', 'module', 'exports', mod.code)(require, module, module.exports);
  return module.exports;
}
try {
  const App = load(${JSON.stringify(entry)}).default;
  createRoot(document.getElementById('root')).render(externals.react.createElement(App));
  new ResizeObserver(() => report({ type: 'height', height: document.documentElement.scrollHeight })).observe(document.body);
} catch (err) {
  report({ type: 'runtime-error', message: String(err && err.message ? err.message : err) });
}
</script></body></html>`;
}
```

`src/preview/compileProject.ts`:
```ts
import type { ProjectFiles } from '@/shared/types';
import { resolveImport } from './resolveImport';
import { ALLOWED_PACKAGES, buildRuntimeHtml, type CompiledModule } from './runtimeHtml';
import { transformFile } from './transformFile';

export const ENTRY_FILE = 'App.tsx';

export type CompileResult = { ok: true; html: string } | { ok: false; error: string };

const REQUIRE_RE = /require\("([^"]+)"\)/g;

/** Compile every file and produce iframe HTML. The first problem found is returned as a readable error. */
export function compileProject(files: ProjectFiles, opts: { tagSources: boolean }): CompileResult {
  if (!(ENTRY_FILE in files)) return { ok: false, error: `Missing ${ENTRY_FILE}` };

  const modules: Record<string, CompiledModule> = {};
  for (const [path, source] of Object.entries(files)) {
    let code: string;
    try {
      code = transformFile(path, source, opts);
    } catch (err) {
      return { ok: false, error: firstLine(err) };
    }

    // Read imports from the compiled output: the TS preset has already dropped unused and type-only imports.
    const deps: Record<string, string> = {};
    for (const [, spec] of code.matchAll(REQUIRE_RE)) {
      if (ALLOWED_PACKAGES.includes(spec)) continue;
      if (!spec.startsWith('.')) {
        const allowed = ALLOWED_PACKAGES.filter((p) => p !== 'react/jsx-runtime').join(', ');
        return { ok: false, error: `${path}: package "${spec}" is not available (allowed: ${allowed})` };
      }
      const target = resolveImport(path, spec, files);
      if (!target) return { ok: false, error: `${path}: cannot find "${spec}"` };
      deps[spec] = target;
    }
    modules[path] = { code, deps };
  }

  return { ok: true, html: buildRuntimeHtml(modules, ENTRY_FILE) };
}

function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^\//, '');
}
```

`src/preview/previewMessages.ts`:
```ts
import { PREVIEW_SOURCE } from './runtimeHtml';

export type PreviewMessage = { type: 'height'; height: number } | { type: 'runtime-error'; message: string };

/** Validate a postMessage payload from the preview iframe. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== PREVIEW_SOURCE) return null;
  if (msg.type === 'height' && typeof msg.height === 'number' && Number.isFinite(msg.height)) {
    return { type: 'height', height: msg.height };
  }
  if (msg.type === 'runtime-error' && typeof msg.message === 'string') {
    return { type: 'runtime-error', message: msg.message };
  }
  return null;
}
```

`src/frame/sampleFiles.ts`:
```ts
import type { ProjectFiles } from '@/shared/types';

/** A small known-good project: used by the dev-only "Insert sample page" button and by tests. */
export const SAMPLE_FILES: ProjectFiles = {
  'App.tsx': `import Header from "./components/Header";
import Hero from "./components/Hero";

export default function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <Header />
      <Hero />
    </main>
  );
}
`,
  'components/Header.tsx': `export default function Header() {
  return (
    <header className="flex items-center justify-between px-10 py-6 border-b border-slate-200">
      <span className="text-xl font-bold">Acme</span>
      <nav className="flex gap-8 text-sm text-slate-600">
        <a href="#">Product</a>
        <a href="#">Pricing</a>
        <a href="#">Blog</a>
      </nav>
    </header>
  );
}
`,
  'components/Hero.tsx': `import { ArrowRight } from "lucide-react";

export default function Hero() {
  return (
    <section className="px-10 py-24 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight">Sketch it. Ship it.</h1>
      <p className="mt-4 text-lg text-slate-600">Draw your idea and get a real page.</p>
      <button className="mt-8 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-white">
        Get started <ArrowRight size={18} />
      </button>
    </section>
  );
}
`,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/preview && npm run typecheck`
Expected: all preview tests PASS and the typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add src/preview src/frame/sampleFiles.ts
git commit -m "feat(preview): compile projects into sandboxed iframe HTML"
```

---

### Task 4: Build pipeline: parse, validate, retry once

**Files:**
- Create: `src/server/build/parseFiles.ts`, `src/server/build/validateProject.ts`, `src/server/build/prompt.ts`, `src/server/build/buildProject.ts`
- Test: `src/server/build/parseFiles.test.ts`, `src/server/build/validateProject.test.ts`, `src/server/build/prompt.test.ts`, `src/server/build/buildProject.test.ts`

**Interfaces:**
- Consumes: `compileProject` and `ALLOWED_PACKAGES` (Task 3), plus `BuildRequest`, `BuildResponse` and `ProjectFiles`
- Produces:
  - `parseFiles(text: string): ProjectFiles`
  - `parseSummary(text: string): string | null`
  - `validateProject(files: ProjectFiles): string[]`, which returns an empty array when valid
  - `BUILD_SYSTEM_PROMPT: string`
  - `buildUserContent(req: BuildRequest): Anthropic.Beta.BetaContentBlockParam[]`
  - `buildFixPrompt(errors: string[]): string`
  - `type Generate = (args: { system: string; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<string>`
  - `buildProject(req: BuildRequest, generate: Generate): Promise<BuildResponse>`

- [ ] **Step 1: Write the failing tests**

`src/server/build/parseFiles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseFiles, parseSummary } from './parseFiles';

describe('parseFiles', () => {
  it('extracts files and normalises ./ paths', () => {
    const text = '<file path="App.tsx">\nexport default 1;\n</file>\n<file path="./components/Hero.tsx">\nconst x = 2;\n</file>';
    expect(parseFiles(text)).toEqual({
      'App.tsx': 'export default 1;\n',
      'components/Hero.tsx': 'const x = 2;\n',
    });
  });

  it('strips markdown fences inside a file block', () => {
    const text = '<file path="App.tsx">\n```tsx\nexport default 1;\n```\n</file>';
    expect(parseFiles(text)['App.tsx']).toBe('export default 1;\n');
  });

  it('returns an empty object when there are no file blocks', () => {
    expect(parseFiles('Sorry, I cannot help.')).toEqual({});
  });
});

describe('parseSummary', () => {
  it('reads the summary line', () => {
    expect(parseSummary('<file path="App.tsx">x</file>\n<summary> A landing page </summary>')).toBe('A landing page');
  });
  it('returns null when missing', () => {
    expect(parseSummary('no summary')).toBeNull();
  });
});
```

`src/server/build/validateProject.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateProject } from './validateProject';

const OK_APP = 'export default function App() { return <main>Hi</main>; }\n';

describe('validateProject', () => {
  it('accepts a valid project', () => {
    expect(validateProject({ 'App.tsx': OK_APP })).toEqual([]);
  });
  it('rejects unsafe or non-TS paths', () => {
    const errors = validateProject({ 'App.tsx': OK_APP, '../evil.tsx': '', 'styles.css': '' });
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toContain('../evil.tsx');
    expect(errors.join(' ')).toContain('styles.css');
  });
  it('reports compile errors', () => {
    expect(validateProject({})).toEqual(['Missing App.tsx']);
  });
});
```

`src/server/build/prompt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';

describe('prompt', () => {
  it('lists the allowed packages in the system prompt', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('react, lucide-react');
  });
  it('sends the image first, then the kind and note', () => {
    const content = buildUserContent({ kind: 'screenshot', imageBase64: 'AAAA', note: '  dark theme ' });
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
    expect(content[1]).toMatchObject({ type: 'text' });
    const text = content[1].type === 'text' ? content[1].text : '';
    expect(text).toContain('Input type: screenshot');
    expect(text).toContain('User note: dark theme');
  });
  it('omits the note line when the note is blank', () => {
    const content = buildUserContent({ kind: 'sketch', imageBase64: 'AAAA', note: '   ' });
    const text = content[1].type === 'text' ? content[1].text : '';
    expect(text).not.toContain('User note');
  });
  it('lists every error in the fix prompt', () => {
    const prompt = buildFixPrompt(['App.tsx: bad', 'Hero.tsx: worse']);
    expect(prompt).toContain('- App.tsx: bad');
    expect(prompt).toContain('- Hero.tsx: worse');
  });
});
```

`src/server/build/buildProject.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { BuildRequest } from '@/shared/types';
import { buildProject, type Generate } from './buildProject';

const REQ: BuildRequest = { kind: 'sketch', imageBase64: 'AAAA', note: '' };
const VALID =
  '<file path="App.tsx">export default function App() { return <main className="p-8">Hi</main>; }</file>\n<summary>A simple page</summary>';
const INVALID =
  '<file path="App.tsx">import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }</file>';

function fakeGenerate(...replies: string[]): Generate & ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const reply of replies) fn.mockResolvedValueOnce(reply);
  return fn as Generate & ReturnType<typeof vi.fn>;
}

describe('buildProject', () => {
  it('returns files and summary when the first answer is valid', async () => {
    const generate = fakeGenerate(VALID);
    const result = await buildProject(REQ, generate);
    expect(result).toMatchObject({ ok: true, summary: 'A simple page' });
    expect(result.ok && Object.keys(result.files)).toEqual(['App.tsx']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('sends compile errors back once and uses the fixed files', async () => {
    const generate = fakeGenerate(INVALID, VALID);
    const result = await buildProject(REQ, generate);
    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    const retry = generate.mock.calls[1][0] as Parameters<Generate>[0];
    expect(retry.messages).toHaveLength(3);
    expect(JSON.stringify(retry.messages[2].content)).toContain('framer-motion');
  });

  it('gives a readable error when the retry is still broken', async () => {
    const generate = fakeGenerate(INVALID, INVALID);
    const result = await buildProject(REQ, generate);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^Couldn't build a working page: .*framer-motion/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/server`
Expected: FAIL, with missing modules `./parseFiles`, `./validateProject`, `./prompt` and `./buildProject`.

- [ ] **Step 3: Implement**

`src/server/build/parseFiles.ts`:
```ts
import type { ProjectFiles } from '@/shared/types';

const FILE_RE = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
const SUMMARY_RE = /<summary>([\s\S]*?)<\/summary>/;
const FENCED_RE = /^```[A-Za-z]*\n([\s\S]*?)\n?```$/;

/** Extract <file path="...">...</file> blocks from model output. */
export function parseFiles(text: string): ProjectFiles {
  const files: ProjectFiles = {};
  for (const [, rawPath, body] of text.matchAll(FILE_RE)) {
    files[rawPath.trim().replace(/^\.?\//, '')] = cleanBody(body);
  }
  return files;
}

export function parseSummary(text: string): string | null {
  const match = text.match(SUMMARY_RE);
  return match ? match[1].trim() : null;
}

function cleanBody(body: string): string {
  let code = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
  const fenced = code.match(FENCED_RE);
  if (fenced) code = fenced[1];
  return `${code}\n`;
}
```

`src/server/build/validateProject.ts`:
```ts
import { compileProject } from '@/preview/compileProject';
import type { ProjectFiles } from '@/shared/types';

const SAFE_PATH = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.tsx?$/;

/** Every problem that would stop the page from rendering. Empty array = valid. */
export function validateProject(files: ProjectFiles): string[] {
  const pathErrors = Object.keys(files)
    .filter((path) => !SAFE_PATH.test(path))
    .map((path) => `Invalid file path "${path}": use paths like App.tsx or components/Hero.tsx`);
  if (pathErrors.length > 0) return pathErrors;
  const result = compileProject(files, { tagSources: false });
  return result.ok ? [] : [result.error];
}
```

`src/server/build/prompt.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import { ALLOWED_PACKAGES } from '@/preview/runtimeHtml';
import type { BuildRequest } from '@/shared/types';

const IMPORTABLE = ALLOWED_PACKAGES.filter((p) => p !== 'react/jsx-runtime').join(', ');

export const BUILD_SYSTEM_PROMPT = `You turn a whiteboard sketch or a screenshot into a single web page built with React and Tailwind CSS.

Output format (follow exactly):
- Write every file as <file path="PATH">CODE</file>. PATH is relative, like App.tsx or components/Hero.tsx.
- After the files, write one line: <summary>one short sentence describing what you built</summary>.
- Write nothing else: no markdown fences, no explanations.

Code rules:
- App.tsx default-exports the page component. Put each page section in its own components/Name.tsx file with a default export.
- Use TypeScript function components. Style only with Tailwind CSS v4 utility classes.
- You may import only: ${IMPORTABLE}, and relative imports between your own files. No CSS files and no other packages.
- For images, use https://placehold.co/WIDTHxHEIGHT placeholder URLs.
- Design for a 1280px wide desktop viewport.

How to read the input:
- sketch: boxes are layout regions, handwritten words are content or labels, and arrows or notes are instructions to you, not content to show. Fill gaps with sensible, realistic content.
- screenshot: reproduce the layout, colors, typography, spacing and visible text as faithfully as you can.`;

export function buildUserContent(req: BuildRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const note = req.note.trim();
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: req.imageBase64 } },
    { type: 'text', text: `Input type: ${req.kind}.${note ? `\nUser note: ${note}` : ''}\nBuild the page.` },
  ];
}

export function buildFixPrompt(errors: string[]): string {
  return `These problems stop the page from compiling:
${errors.map((e) => `- ${e}`).join('\n')}
Return corrected versions of only the files that need changes, in the same <file> format, then the <summary> line.`;
}
```

`src/server/build/buildProject.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { parseFiles, parseSummary } from './parseFiles';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';
import { validateProject } from './validateProject';

/** Sends a conversation to the model and returns its text. Injected so tests never call the API. */
export type Generate = (args: { system: string; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<string>;

export async function buildProject(req: BuildRequest, generate: Generate): Promise<BuildResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: buildUserContent(req) }];
  const first = await generate({ system: BUILD_SYSTEM_PROMPT, messages });
  let files = parseFiles(first);
  let summary = parseSummary(first);
  let errors = validateProject(files);

  if (errors.length > 0) {
    const retryMessages: Anthropic.Beta.BetaMessageParam[] = [
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: buildFixPrompt(errors) },
    ];
    const second = await generate({ system: BUILD_SYSTEM_PROMPT, messages: retryMessages });
    // The fix may return only the changed files, so merge over the first attempt.
    files = { ...files, ...parseFiles(second) };
    summary = parseSummary(second) ?? summary;
    errors = validateProject(files);
    if (errors.length > 0) return { ok: false, error: `Couldn't build a working page: ${errors[0]}` };
  }

  return { ok: true, files, summary: summary ?? 'Built the page.' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: every test PASSES and the typecheck is clean. If `Anthropic.Beta.BetaContentBlockParam` or `BetaMessageParam` isn't found, use the name `tsc` suggests from the installed SDK. Don't redefine the types yourself.

- [ ] **Step 5: Commit**

```bash
git add src/server/build
git commit -m "feat(build): parse, validate and retry model output"
```

---

### Task 5: Claude client and the `/api/build` route

**Files:**
- Create: `src/server/build/parseBuildRequest.ts`, `src/server/ai/generateWithClaude.ts`, `src/app/api/build/route.ts`
- Test: `src/server/build/parseBuildRequest.test.ts`

**Interfaces:**
- Consumes: `buildProject`, `Generate` (Task 4), `BuildRequest`
- Produces:
  - `parseBuildRequest(body: unknown): { ok: true; value: BuildRequest } | { ok: false; error: string }`
  - `MAX_IMAGE_BYTES`, `MAX_NOTE_CHARS`
  - `generateWithClaude: Generate`
  - `class BuildError extends Error`
  - `BUILD_MODEL = 'claude-opus-5'`
  - `POST /api/build`, which takes a JSON `BuildRequest` and returns a JSON `BuildResponse`. The status is 400 for a bad body and 502 for an AI failure.

- [ ] **Step 1: Write the failing test**

`src/server/build/parseBuildRequest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_NOTE_CHARS, parseBuildRequest } from './parseBuildRequest';

describe('parseBuildRequest', () => {
  it('accepts a valid body and defaults the note', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA' })).toEqual({
      ok: true,
      value: { kind: 'sketch', imageBase64: 'AAAA', note: '' },
    });
  });
  it('rejects non-objects', () => {
    expect(parseBuildRequest(null)).toMatchObject({ ok: false });
    expect(parseBuildRequest('x')).toMatchObject({ ok: false });
  });
  it('rejects an unknown kind', () => {
    expect(parseBuildRequest({ kind: 'video', imageBase64: 'AAAA' })).toMatchObject({ ok: false });
  });
  it('rejects a missing image', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: '' })).toMatchObject({ ok: false });
  });
  it('rejects images over 5 MB with a readable message', () => {
    const tooBig = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) * (4 / 3)) + 4);
    const result = parseBuildRequest({ kind: 'screenshot', imageBase64: tooBig });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain('5 MB');
  });
  it('rejects a non-string note and truncates a long one', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA', note: 5 })).toMatchObject({ ok: false });
    const result = parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA', note: 'x'.repeat(MAX_NOTE_CHARS + 50) });
    expect(result.ok && result.value.note.length).toBe(MAX_NOTE_CHARS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/server/build/parseBuildRequest.test.ts`
Expected: FAIL, "Failed to resolve import './parseBuildRequest'".

- [ ] **Step 3: Implement**

`src/server/build/parseBuildRequest.ts`:
```ts
import type { BuildRequest } from '@/shared/types';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_CHARS = 2000;

export type ParseBuildRequestResult = { ok: true; value: BuildRequest } | { ok: false; error: string };

export function parseBuildRequest(body: unknown): ParseBuildRequestResult {
  if (typeof body !== 'object' || body === null) return fail('Request body must be a JSON object.');
  const { kind, imageBase64, note } = body as Record<string, unknown>;
  if (kind !== 'sketch' && kind !== 'screenshot') return fail('kind must be "sketch" or "screenshot".');
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) return fail('imageBase64 is required.');
  if (Math.floor((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return fail('Image is too large (max 5 MB). Zoom out or crop it and try again.');
  }
  if (note !== undefined && typeof note !== 'string') return fail('note must be a string.');
  return { ok: true, value: { kind, imageBase64, note: (note ?? '').slice(0, MAX_NOTE_CHARS) } };
}

function fail(error: string): ParseBuildRequestResult {
  return { ok: false, error };
}
```

`src/server/ai/generateWithClaude.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import type { Generate } from '@/server/build/buildProject';

export const BUILD_MODEL = 'claude-opus-5';

/** An AI failure whose message is safe to show the user. */
export class BuildError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Created lazily so importing this module never requires credentials (e.g. in tests).
  client ??= new Anthropic();
  return client;
}

export const generateWithClaude: Generate = async ({ system, messages }) => {
  const stream = getClient().beta.messages.stream({
    model: BUILD_MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system,
    messages,
    // On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new BuildError('The AI declined to build this. Try a different sketch or screenshot.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new BuildError('That page is too big to build in one go. Try a smaller section.');
  }
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
};
```

`src/app/api/build/route.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BuildError, generateWithClaude } from '@/server/ai/generateWithClaude';
import { buildProject } from '@/server/build/buildProject';
import { parseBuildRequest } from '@/server/build/parseBuildRequest';
import type { BuildResponse } from '@/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse<BuildResponse>> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseBuildRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  try {
    return NextResponse.json(await buildProject(parsed.value, generateWithClaude));
  } catch (err) {
    console.error('[api/build]', err);
    return NextResponse.json({ ok: false, error: userMessage(err) }, { status: 502 });
  }
}

function userMessage(err: unknown): string {
  if (err instanceof BuildError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return 'The server AI key is missing or invalid. Check ANTHROPIC_API_KEY in .env.local.';
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check your internet connection.';
  return 'Something went wrong while building. Please try again.';
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS. If `tsc` rejects `fallbacks: 'default'` or the beta name, the installed SDK is older than the field. Run `npm install @anthropic-ai/sdk@latest`, re-run, and don't cast it away.

- [ ] **Step 5: Smoke-test the route against the real API**

Create `.env.local` with `ANTHROPIC_API_KEY=<owner's key>`, then:
```bash
npm run dev &
sleep 8
curl -s -X POST localhost:3000/api/build -H 'Content-Type: application/json' -d '{"kind":"sketch"}'
```
Expected: HTTP 400 JSON `{"ok":false,"error":"imageBase64 is required."}`. Leave the full image round-trip to Task 7's manual check. Stop the dev server afterwards (`kill %1`).

- [ ] **Step 6: Commit**

```bash
git add src/server src/app/api
git commit -m "feat(api): /api/build calls Claude with validation and one retry"
```

---

### Task 6: The board and the live frame shape

**Files:**
- Create: `src/frame/frameTypes.ts`, `src/frame/FrameShapeUtil.tsx`, `src/frame/FramePreview.tsx`, `src/board/Board.tsx`
- Modify: `src/app/page.tsx` (replace it entirely)

**Interfaces:**
- Consumes: `compileProject` (Task 3, loaded with a dynamic `import()` so Babel stays out of the first page load), `parsePreviewMessage`, `SAMPLE_FILES`
- Produces:
  - `FRAME_TYPE = 'drawai-frame'`
  - `type FrameStatus = 'building' | 'ready' | 'error'`
  - `interface FrameProps { w: number; h: number; files: Record<string, string>; status: FrameStatus; error: string }`
  - `FrameShapeUtil`, `type FrameShape`
  - `Board` (default export), which Task 7 extends with `BuildBar` and crash recovery

- [ ] **Step 1: Write the frame type and shape**

`src/frame/frameTypes.ts`:
```ts
export const FRAME_TYPE = 'drawai-frame' as const;

export type FrameStatus = 'building' | 'ready' | 'error';

export interface FrameProps {
  w: number;
  h: number;
  /** The page source. Lives in the shape so tldraw undo + persistence cover it in M1. */
  files: Record<string, string>;
  status: FrameStatus;
  error: string;
}

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [FRAME_TYPE]: FrameProps;
  }
}
```

`src/frame/FrameShapeUtil.tsx`:
```tsx
import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw';
import { FramePreview } from './FramePreview';
import { FRAME_TYPE, type FrameProps } from './frameTypes';

export type FrameShape = TLShape<typeof FRAME_TYPE>;

export const FRAME_WIDTH = 1280;

export class FrameShapeUtil extends BaseBoxShapeUtil<FrameShape> {
  static override type = FRAME_TYPE;

  static override props: RecordProps<FrameShape> = {
    w: T.number,
    h: T.number,
    files: T.dict(T.string, T.string),
    status: T.literalEnum('building', 'ready', 'error'),
    error: T.string,
  };

  getDefaultProps(): FrameProps {
    return { w: FRAME_WIDTH, h: 800, files: {}, status: 'building', error: '' };
  }

  // Width is the desktop viewport; height follows the content.
  override canResize() {
    return false;
  }

  component(shape: FrameShape) {
    return (
      <HTMLContainer
        id={shape.id}
        style={{
          background: '#fff',
          border: '1px solid #d4d4d8',
          borderRadius: 8,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <FramePreview shape={shape} />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: FrameShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
```

- [ ] **Step 2: Write the preview component**

`src/frame/FramePreview.tsx`:
```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor } from 'tldraw';
import { parsePreviewMessage } from '@/preview/previewMessages';
import type { FrameShape } from './FrameShapeUtil';
import { FRAME_TYPE } from './frameTypes';

const MIN_HEIGHT = 200;

export function FramePreview({ shape }: { shape: FrameShape }) {
  const editor = useEditor();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { files, status, error } = shape.props;

  // Compile whenever the files change. Babel is loaded on demand.
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    import('@/preview/compileProject').then(({ compileProject }) => {
      if (cancelled) return;
      const result = compileProject(files, { tagSources: true });
      setHtml(result.ok ? result.html : null);
      setProblem(result.ok ? null : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [files, status]);

  // Listen to this frame's iframe only: resize to content, surface runtime errors.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = parsePreviewMessage(event.data);
      if (!msg) return;
      if (msg.type === 'runtime-error') {
        setProblem(msg.message);
        return;
      }
      const height = Math.max(MIN_HEIGHT, Math.ceil(msg.height));
      const current = editor.getShape(shape.id) as FrameShape | undefined;
      if (!current || Math.abs(current.props.h - height) < 2) return;
      // Auto-resizing is not a user action: keep it out of undo history.
      editor.run(() => editor.updateShape({ id: shape.id, type: FRAME_TYPE, props: { h: height } }), {
        history: 'ignore',
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [editor, shape.id]);

  if (status === 'building') return <Centered>Building your page…</Centered>;
  if (status === 'error') return <Centered tone="error">{error}</Centered>;

  return (
    <>
      {html && (
        <iframe
          ref={iframeRef}
          title="Page preview"
          sandbox="allow-scripts"
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 0, display: 'block', pointerEvents: 'none' }}
        />
      )}
      {problem && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px 16px',
            background: '#fef2f2',
            color: '#991b1b',
            font: '14px/1.4 system-ui, sans-serif',
            borderTop: '1px solid #fecaca',
          }}
        >
          {problem}
        </div>
      )}
    </>
  );
}

function Centered({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        font: '20px/1.4 system-ui, sans-serif',
        color: tone === 'error' ? '#b91c1c' : '#52525b',
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write the board and page**

`src/board/Board.tsx`:
```tsx
'use client';

import { createShapeId, Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { FrameShapeUtil } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { SAMPLE_FILES } from '@/frame/sampleFiles';

const shapeUtils = [FrameShapeUtil];

function insertSampleFrame(editor: Editor) {
  const view = editor.getViewportPageBounds();
  editor.createShape({
    id: createShapeId(),
    type: FRAME_TYPE,
    x: view.x + 40,
    y: view.y + 40,
    props: { status: 'ready', files: SAMPLE_FILES },
  });
}

export default function Board() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawai-board"
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          if (editor.getCurrentPageShapes().length === 0) insertSampleFrame(editor);
        }}
      />
    </div>
  );
}
```

`src/app/page.tsx`:
```tsx
'use client';

import dynamic from 'next/dynamic';

// tldraw and the preview compiler are browser-only.
const Board = dynamic(() => import('@/board/Board'), { ssr: false });

export default function Home() {
  return <Board />;
}
```

- [ ] **Step 4: Typecheck and run the existing tests**

Run: `npm run typecheck && npx vitest run`
Expected: clean, all PASS. If tldraw 5.4.2's types differ, fix against the compiler errors rather than using `any`. Likely spots are the `getIndicatorPath` name, `editor.run` options, or the `T.dict`/`T.literalEnum` validators. Check the tldraw docs through context7 (`/llmstxt/tldraw_dev_llms_txt`) for the right name.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev` and open http://localhost:3000. Clear the site's local storage first if you've opened it before.
Expected:
1. The board loads, and a white frame shows the sample page: an "Acme" header with 3 nav links and a "Sketch it. Ship it." hero with a dark button and an arrow icon.
2. The frame's height hugs the content, so there's no big blank area below the hero.
3. DevTools → Elements, inside the iframe: `<nav data-src="components/Header.tsx:4:7" …>` is present.
4. You can pan, zoom and draw with the pen on top of the frame, and the page underneath doesn't react to clicks.
5. After a reload, the frame is still there (restored from local persistence).

- [ ] **Step 6: Commit**

```bash
git add src/frame src/board src/app/page.tsx
git commit -m "feat(board): tldraw board with live React+Tailwind frame shape"
```

---

### Task 7: Build from selection (sketch or screenshot → page)

**Files:**
- Create: `src/board/selectionHelpers.ts`, `src/board/buildFromSelection.ts`, `src/board/BuildBar.tsx`
- Modify: `src/board/Board.tsx` (full replacement below)
- Test: `src/board/selectionHelpers.test.ts`

**Interfaces:**
- Consumes: `FRAME_TYPE` and `FrameShape` (Task 6), `BuildRequest` and `BuildResponse`, and `POST /api/build` (Task 5)
- Produces:
  - `checkSelection(shapes: ReadonlyArray<{ type: string }>): { ok: true; kind: BuildKind } | { ok: false; error: string }`
  - `fitScale(w: number, h: number, maxW: number, maxH: number): number`
  - `MAX_EXPORT_W = 1600`, `MAX_EXPORT_H = 8000`
  - `findInterruptedFrames(shapes: ReadonlyArray<{ id: TLShapeId; type: string; props: unknown }>): TLShapeId[]`
  - `buildFromSelection(editor: Editor, note: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `BuildBar`

- [ ] **Step 1: Write the failing test**

`src/board/selectionHelpers.test.ts`:
```ts
import type { TLShapeId } from 'tldraw';
import { describe, expect, it } from 'vitest';
import { checkSelection, findInterruptedFrames, fitScale } from './selectionHelpers';

const id = (s: string) => `shape:${s}` as TLShapeId;

describe('checkSelection', () => {
  it('asks for a selection when nothing is selected', () => {
    expect(checkSelection([])).toEqual({ ok: false, error: 'Select a sketch or a screenshot first.' });
  });
  it('treats a single image as a screenshot', () => {
    expect(checkSelection([{ type: 'image' }])).toEqual({ ok: true, kind: 'screenshot' });
  });
  it('treats drawings, or an image with drawings on it, as a sketch', () => {
    expect(checkSelection([{ type: 'draw' }, { type: 'geo' }])).toEqual({ ok: true, kind: 'sketch' });
    expect(checkSelection([{ type: 'image' }, { type: 'arrow' }])).toEqual({ ok: true, kind: 'sketch' });
  });
  it('refuses selections that include a built frame', () => {
    const result = checkSelection([{ type: 'draw' }, { type: 'drawai-frame' }]);
    expect(result.ok).toBe(false);
  });
});

describe('fitScale', () => {
  it('never upscales', () => {
    expect(fitScale(400, 300, 1600, 8000)).toBe(1);
  });
  it('shrinks to fit the tighter dimension', () => {
    expect(fitScale(3200, 1000, 1600, 8000)).toBe(0.5);
    expect(fitScale(1280, 16000, 1600, 8000)).toBe(0.5);
  });
  it('returns 1 for empty bounds', () => {
    expect(fitScale(0, 0, 1600, 8000)).toBe(1);
  });
});

describe('findInterruptedFrames', () => {
  it('returns frames still marked as building', () => {
    const shapes = [
      { id: id('a'), type: 'drawai-frame', props: { status: 'building' } },
      { id: id('b'), type: 'drawai-frame', props: { status: 'ready' } },
      { id: id('c'), type: 'draw', props: { status: 'building' } },
    ];
    expect(findInterruptedFrames(shapes)).toEqual([id('a')]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/board`
Expected: FAIL, "Failed to resolve import './selectionHelpers'".

- [ ] **Step 3: Implement the helpers**

`src/board/selectionHelpers.ts`:
```ts
import type { TLShapeId } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { BuildKind } from '@/shared/types';

export const MAX_EXPORT_W = 1600;
export const MAX_EXPORT_H = 8000;

export type SelectionCheck = { ok: true; kind: BuildKind } | { ok: false; error: string };

export function checkSelection(shapes: ReadonlyArray<{ type: string }>): SelectionCheck {
  if (shapes.length === 0) return { ok: false, error: 'Select a sketch or a screenshot first.' };
  if (shapes.some((s) => s.type === FRAME_TYPE)) {
    return { ok: false, error: "Built pages can't be rebuilt yet. Select only your sketch or screenshot." };
  }
  const kind: BuildKind = shapes.length === 1 && shapes[0].type === 'image' ? 'screenshot' : 'sketch';
  return { ok: true, kind };
}

/** Export scale that keeps the image within maxW × maxH without upscaling. */
export function fitScale(w: number, h: number, maxW: number, maxH: number): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, maxW / w, maxH / h);
}

/** Frames persisted mid-build (e.g. the tab was reloaded) that will never finish. */
export function findInterruptedFrames(
  shapes: ReadonlyArray<{ id: TLShapeId; type: string; props: unknown }>,
): TLShapeId[] {
  return shapes
    .filter((s) => s.type === FRAME_TYPE && (s.props as { status?: unknown }).status === 'building')
    .map((s) => s.id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/board`
Expected: 8 tests PASS.

- [ ] **Step 5: Implement the build flow, the bar and crash recovery**

`src/board/buildFromSelection.ts`:
```ts
import { createShapeId, type Editor } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { checkSelection, fitScale, MAX_EXPORT_H, MAX_EXPORT_W } from './selectionHelpers';

const FRAME_GAP = 120;

/** Export the selection as PNG, place a "building" frame beside it, and fill it with the built page. */
export async function buildFromSelection(
  editor: Editor,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const shapes = editor.getSelectedShapes();
  const check = checkSelection(shapes);
  if (!check.ok) return check;
  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return { ok: false, error: 'Select a sketch or a screenshot first.' };

  const { blob } = await editor.toImage(
    shapes.map((s) => s.id),
    { format: 'png', background: true, padding: 16, scale: fitScale(bounds.w, bounds.h, MAX_EXPORT_W, MAX_EXPORT_H) },
  );
  const imageBase64 = await blobToBase64(blob);

  const frameId = createShapeId();
  editor.createShape({
    id: frameId,
    type: FRAME_TYPE,
    x: bounds.maxX + FRAME_GAP,
    y: bounds.minY,
    props: { status: 'building' },
  });

  const response = await postBuild({ kind: check.kind, imageBase64, note });
  if (response.ok) {
    editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { status: 'ready', files: response.files, error: '' } });
    return { ok: true };
  }
  editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { status: 'error', error: response.error } });
  return { ok: false, error: response.error };
}

async function postBuild(body: BuildRequest): Promise<BuildResponse> {
  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as BuildResponse;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check that it is running and try again.' };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
```

`src/board/BuildBar.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useValue, type Editor } from 'tldraw';
import { buildFromSelection } from './buildFromSelection';

export function BuildBar({ editor }: { editor: Editor }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasSelection = useValue('has selection', () => editor.getSelectedShapeIds().length > 0, [editor]);

  async function onBuild() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await buildFromSelection(editor, note);
      if (result.ok) setNote('');
      else setMessage(result.error);
    } catch {
      setMessage('Something went wrong while exporting your selection. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        font: '14px system-ui, sans-serif',
      }}
    >
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note, e.g. dark theme, SaaS landing page"
        maxLength={2000}
        style={{ width: 320, padding: '8px 10px', border: '1px solid #d4d4d8', borderRadius: 8 }}
      />
      <button
        onClick={onBuild}
        disabled={!hasSelection || busy}
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          border: 0,
          background: !hasSelection || busy ? '#a1a1aa' : '#18181b',
          color: '#fff',
          cursor: !hasSelection || busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Building…' : 'Build from selection'}
      </button>
      {message && (
        <span role="alert" style={{ color: '#b91c1c', maxWidth: 360 }}>
          {message}
        </span>
      )}
    </div>
  );
}
```

`src/board/Board.tsx` (full replacement):
```tsx
'use client';

import { useState } from 'react';
import { createShapeId, Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { FrameShapeUtil } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import { BuildBar } from './BuildBar';
import { findInterruptedFrames } from './selectionHelpers';

const shapeUtils = [FrameShapeUtil];

function insertSampleFrame(editor: Editor) {
  const view = editor.getViewportPageBounds();
  editor.createShape({
    id: createShapeId(),
    type: FRAME_TYPE,
    x: view.x + 40,
    y: view.y + 40,
    props: { status: 'ready', files: SAMPLE_FILES },
  });
}

/** A frame saved mid-build (tab reloaded or closed) will never finish; say so instead of spinning forever. */
function recoverInterruptedBuilds(editor: Editor) {
  const ids = findInterruptedFrames(editor.getCurrentPageShapes());
  if (ids.length === 0) return;
  editor.run(
    () =>
      editor.updateShapes(
        ids.map((id) => ({
          id,
          type: FRAME_TYPE,
          props: { status: 'error' as const, error: 'This build was interrupted. Select your sketch and click Build again.' },
        })),
      ),
    { history: 'ignore' },
  );
}

export default function Board() {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawai-board"
        shapeUtils={shapeUtils}
        onMount={(mounted) => {
          recoverInterruptedBuilds(mounted);
          if (mounted.getCurrentPageShapes().length === 0) insertSampleFrame(mounted);
          setEditor(mounted);
        }}
      />
      {editor && <BuildBar editor={editor} />}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and run all tests**

Run: `npm run typecheck && npx vitest run`
Expected: clean and all PASS. If `toImage` in tldraw 5.4.2 has no `padding` option, remove that key; the export works without it.

- [ ] **Step 7: Manual end-to-end check with the real API** (costs a few cents per build)

Run `npm run dev` with `.env.local` set, open http://localhost:3000, and check:
1. **Sketch:** draw three rectangles (a nav bar, a hero and a row of cards), write "Pricing" in one card with the text tool, select everything, type "dark theme" in the note box and click **Build from selection**. A "Building your page…" frame appears to the right right away. Within about a minute it becomes a dark page with a nav, a hero and cards, one of them titled Pricing.
2. **Screenshot:** paste or drag a screenshot of any website onto the board, select it alone and build. A frame appears that resembles it.
3. **Guard rails:** with nothing selected the button is disabled. Select a built frame and build: the red message says built pages can't be rebuilt, and no request appears in the DevTools Network tab.
4. **Interrupted build:** start a build and reload the tab while it's spinning. After the reload the frame says the build was interrupted.
5. **Missing key:** stop the server, blank the key in `.env.local`, restart and build. The frame shows "The server AI key is missing or invalid…".

- [ ] **Step 8: Commit**

```bash
git add src/board
git commit -m "feat(board): build a live page from a sketch or screenshot selection"
```

---

## After M1

- M2 (the edit loop: voice, numbered segments, gestures, hit-testing, targeted edits), M3 (auth, persistence, limits, export) and M4 (URL import) each get their own plan, written when the previous milestone ships.
- M1 deliberately leaves out: interact mode (clicking inside the page), a versions table, auth, limits and export. They're all in later milestones.
