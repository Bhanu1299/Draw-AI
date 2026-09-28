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
