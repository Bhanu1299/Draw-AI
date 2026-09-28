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
