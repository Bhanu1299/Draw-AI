import type { Rect } from '@/shared/geometry';
import { PREVIEW_SOURCE } from './runtimeHtml';

/** A tagged element in the preview, in the page's CSS pixels (document coordinates). */
export interface PreviewElement {
  /** data-src tag: "components/Header.tsx:18:4". */
  src: string;
  tag: string;
  text: string;
  rect: Rect;
  /** Index of the nearest tagged ancestor in the same list, or -1. */
  parent: number;
}

export type PreviewMessage =
  | { type: 'height'; height: number }
  | { type: 'runtime-error'; message: string }
  | { type: 'elements'; elements: PreviewElement[] };

export const MAX_ELEMENTS = 3000;

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
  if (msg.type === 'elements' && Array.isArray(msg.elements)) {
    const elements = msg.elements.slice(0, MAX_ELEMENTS).map(toElement);
    // Parent indexes point into this list, so one bad entry makes the whole map untrustworthy.
    if (elements.some((e, i) => e === null || e.parent >= i)) return null;
    return { type: 'elements', elements: elements as PreviewElement[] };
  }
  return null;
}

function toElement(value: unknown): PreviewElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const { src, tag, text, rect, parent } = value as Record<string, unknown>;
  if (typeof src !== 'string' || typeof tag !== 'string' || typeof text !== 'string') return null;
  if (typeof parent !== 'number' || !Number.isInteger(parent) || parent < -1) return null;
  if (typeof rect !== 'object' || rect === null) return null;
  const { x, y, w, h } = rect as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { src, tag, text: text.slice(0, 80), rect: { x: x as number, y: y as number, w: w as number, h: h as number }, parent };
}
