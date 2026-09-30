import { cleanBody, normalizePath } from '@/server/build/parseFiles';

export type FileOp =
  | { type: 'edit'; path: string; old: string; new: string }
  | { type: 'write'; path: string; content: string }
  | { type: 'delete'; path: string };

const OP_RE =
  /<edit path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/edit>|<file path="([^"]+)">([\s\S]*?)<\/file>|<delete path="([^"]+)"\s*\/>/g;

/** Read the model's change blocks, in the order written. */
export function parseOps(text: string): FileOp[] {
  const ops: FileOp[] = [];
  for (const m of text.matchAll(OP_RE)) {
    if (m[1] !== undefined) ops.push({ type: 'edit', path: normalizePath(m[1]), old: trimBlock(m[2]), new: trimBlock(m[3]) });
    else if (m[4] !== undefined) ops.push({ type: 'write', path: normalizePath(m[4]), content: cleanBody(m[5]) });
    else ops.push({ type: 'delete', path: normalizePath(m[6]) });
  }
  return ops;
}

/** Drop the newline right after <old>/<new> and right before the closing tag; keep everything else. */
function trimBlock(block: string): string {
  return block.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
}
