import type { MarkTarget, TargetElement } from './types';

const SRC_RE = /^(.+):(\d+):(\d+)$/;

/** Split a data-src tag ("components/Header.tsx:18:4") into its file path and line. */
export function parseSrc(src: string): { path: string; line: number } | null {
  const match = src.match(SRC_RE);
  return match ? { path: match[1], line: Number(match[2]) } : null;
}

/** Every element a target names: the elements themselves, or a region's neighbours. */
export function targetElements(target: MarkTarget): TargetElement[] {
  if (target.kind === 'elements') return target.elements;
  const { inside, elementAbove, elementBelow, covers } = target.region;
  return [inside, elementAbove, elementBelow, ...covers].filter((e): e is TargetElement => e !== null);
}
