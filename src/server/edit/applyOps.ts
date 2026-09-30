import { ENTRY_FILE } from '@/preview/compileProject';
import type { ProjectFiles } from '@/shared/types';
import type { FileOp } from './parseOps';

/**
 * Apply ops in order. Ops that fail are skipped and reported ("path: problem") so a fix round can
 * resend just those against the current files.
 */
export function applyOps(files: ProjectFiles, ops: FileOp[]): { files: ProjectFiles; errors: string[] } {
  const next = { ...files };
  const errors: string[] = [];
  for (const op of ops) {
    if (op.type === 'write') {
      next[op.path] = op.content;
    } else if (op.type === 'delete') {
      if (op.path === ENTRY_FILE) errors.push(`${op.path}: ${ENTRY_FILE} can't be deleted.`);
      else delete next[op.path];
    } else if (!(op.path in next)) {
      errors.push(`${op.path}: file does not exist. Use <file> to create it.`);
    } else {
      const replaced = replaceOnce(next[op.path], op.old, op.new);
      if (typeof replaced === 'string') next[op.path] = replaced;
      else errors.push(`${op.path}: ${replaced.error}`);
    }
  }
  return { files: next, errors };
}

/** Replace the one place `old` occurs; fall back to whole-line matching that ignores indentation. */
export function replaceOnce(source: string, old: string, replacement: string): string | { error: string } {
  if (old.trim() === '') return { error: 'the <old> text is empty. Quote the exact code to replace.' };
  const exact = source.split(old).length - 1;
  if (exact === 1) return source.replace(old, () => replacement);
  if (exact > 1) return { error: `the <old> text matches ${exact} places. Include more surrounding lines so it matches one.` };

  const lines = source.split('\n');
  const want = old.split('\n').map((l) => l.trim());
  const hits: number[] = [];
  for (let i = 0; i + want.length <= lines.length; i++) {
    if (want.every((w, j) => lines[i + j].trim() === w)) hits.push(i);
  }
  if (hits.length === 1) {
    const at = hits[0];
    return [...lines.slice(0, at), ...replacement.split('\n'), ...lines.slice(at + want.length)].join('\n');
  }
  if (hits.length > 1) return { error: `the <old> text matches ${hits.length} places. Include more surrounding lines so it matches one.` };
  return { error: 'the <old> text was not found. Copy it exactly from the current file.' };
}
