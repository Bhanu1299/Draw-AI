import type { ProjectFiles } from '@/shared/types';
import { resolveImport } from './resolveImport';
import { ALLOWED_PACKAGES, buildRuntimeHtml, type CompiledModule } from './runtimeHtml';
import { transformFile } from './transformFile';

export const ENTRY_FILE = 'App.tsx';

/** `paths` lists the files reachable from App.tsx: the only ones compiled and rendered. */
export type CompileResult = { ok: true; html: string; paths: string[] } | { ok: false; error: string };

const REQUIRE_RE = /require\("([^"]+)"\)/g;

/**
 * Compile App.tsx and every file it reaches, and produce iframe HTML. Files nothing imports are ignored,
 * so a stray or broken leftover can't fail an otherwise working page. The first problem is returned as a readable error.
 */
export function compileProject(files: ProjectFiles, opts: { tagSources: boolean }): CompileResult {
  if (!(ENTRY_FILE in files)) return { ok: false, error: `Missing ${ENTRY_FILE}` };

  const modules: Record<string, CompiledModule> = {};
  const queue = [ENTRY_FILE];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (path in modules) continue;
    let code: string;
    try {
      code = transformFile(path, files[path], opts);
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
      queue.push(target);
    }
    modules[path] = { code, deps };
  }

  return { ok: true, html: buildRuntimeHtml(modules, ENTRY_FILE), paths: Object.keys(modules) };
}

function firstLine(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^\//, '');
}
