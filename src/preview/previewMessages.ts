import { PREVIEW_SOURCE } from './runtimeHtml';

export type PreviewMessage = { type: 'height'; height: number } | { type: 'runtime-error'; message: string };

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
  return null;
}
