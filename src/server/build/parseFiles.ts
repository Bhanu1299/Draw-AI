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
