import { compileProject } from '@/preview/compileProject';
import type { ProjectFiles } from '@/shared/types';

const SAFE_PATH = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.tsx?$/;

export type ValidationResult = { ok: true; files: ProjectFiles } | { ok: false; errors: string[] };

/**
 * Check that the page compiles and renders from App.tsx. On success, returns only the files the page
 * uses: leftovers nothing imports are dropped, so the model never has to "delete" a bad file.
 */
export function validateProject(files: ProjectFiles): ValidationResult {
  const result = compileProject(files, { tagSources: false });
  if (!result.ok) return { ok: false, errors: [result.error] };
  const pathErrors = result.paths
    .filter((path) => !SAFE_PATH.test(path))
    .map((path) => `Invalid file path "${path}": use paths like App.tsx or components/Hero.tsx`);
  if (pathErrors.length > 0) return { ok: false, errors: pathErrors };
  return { ok: true, files: Object.fromEntries(result.paths.map((path) => [path, files[path]])) };
}
