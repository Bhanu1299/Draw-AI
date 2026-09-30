import type { EditRequest, MarkTarget, RegionDescription, Segment, TargetElement } from '@/shared/types';

export const MAX_FILES = 60;
export const MAX_TOTAL_CHARS = 400_000;
export const MAX_SEGMENTS = 20;
export const MAX_INSTRUCTION_CHARS = 2000;
const MAX_INK_BYTES = 1024 * 1024;
const GESTURES: ReadonlySet<unknown> = new Set(['circle', 'arrow', 'cross-out', 'underline', 'sketch']);
const SIDES: ReadonlySet<unknown> = new Set(['left', 'right', 'above', 'below']);

export type ParseEditRequestResult = { ok: true; value: EditRequest } | { ok: false; error: string };

export function parseEditRequest(body: unknown): ParseEditRequestResult {
  if (!isObject(body)) return fail('Request body must be a JSON object.');
  const { files, segments, instruction, runtimeError } = body;
  if (!isObject(files) || !Object.values(files).every((v) => typeof v === 'string')) {
    return fail('files must map paths to file contents.');
  }
  const contents = Object.values(files) as string[];
  if (!('App.tsx' in files)) return fail('files must include App.tsx.');
  if (contents.length > MAX_FILES) return fail(`Too many files (max ${MAX_FILES}).`);
  if (contents.reduce((n, v) => n + v.length, 0) > MAX_TOTAL_CHARS) return fail('This page is too big to edit.');
  if (!Array.isArray(segments) || segments.length > MAX_SEGMENTS || !segments.every(isSegment)) {
    return fail(`segments must be a list of at most ${MAX_SEGMENTS} valid marks.`);
  }
  if (instruction !== undefined && typeof instruction !== 'string') return fail('instruction must be a string.');
  if (runtimeError !== undefined && typeof runtimeError !== 'string') return fail('runtimeError must be a string.');
  const text = typeof instruction === 'string' ? instruction.slice(0, MAX_INSTRUCTION_CHARS) : '';
  const crash = typeof runtimeError === 'string' ? runtimeError.slice(0, MAX_INSTRUCTION_CHARS) : '';
  if (text.trim() === '' && segments.length === 0 && crash === '') return fail('Say what to change, or draw on the page.');
  return {
    ok: true,
    value: { files: files as Record<string, string>, segments, instruction: text, ...(crash ? { runtimeError: crash } : {}) },
  };
}

function fail(error: string): ParseEditRequestResult {
  return { ok: false, error };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isShortString = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length <= max;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isTargetElement(v: unknown): v is TargetElement {
  return isObject(v) && isShortString(v.src) && isShortString(v.tag, 40) && isShortString(v.text);
}

const isElementOrNull = (v: unknown) => v === null || isTargetElement(v);

function isRegion(v: unknown): v is RegionDescription {
  return (
    isObject(v) &&
    [v.width, v.height, v.left, v.top].every(isNumber) &&
    typeof v.fullWidth === 'boolean' &&
    (v.outside === null || SIDES.has(v.outside)) &&
    isElementOrNull(v.inside) &&
    isElementOrNull(v.elementAbove) &&
    isElementOrNull(v.elementBelow) &&
    Array.isArray(v.covers) &&
    v.covers.length <= 8 &&
    v.covers.every(isTargetElement)
  );
}

function isTarget(v: unknown): v is MarkTarget {
  if (!isObject(v)) return false;
  if (v.kind === 'elements') return Array.isArray(v.elements) && v.elements.length <= 20 && v.elements.every(isTargetElement);
  return v.kind === 'region' && isRegion(v.region);
}

function isSegment(v: unknown): v is Segment {
  return (
    isObject(v) &&
    Number.isInteger(v.n) &&
    GESTURES.has(v.gesture) &&
    isTarget(v.target) &&
    (v.pointsTo === undefined || isTarget(v.pointsTo)) &&
    typeof v.unsure === 'boolean' &&
    Array.isArray(v.wrote) &&
    v.wrote.length <= 10 &&
    v.wrote.every((w) => isShortString(w, 500)) &&
    (v.inkPng === undefined ||
      (typeof v.inkPng === 'string' && v.inkPng.length > 0 && Math.floor((v.inkPng.length * 3) / 4) <= MAX_INK_BYTES))
  );
}
