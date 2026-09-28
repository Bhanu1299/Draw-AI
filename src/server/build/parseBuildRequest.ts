import type { BuildRequest } from '@/shared/types';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_CHARS = 2000;

export type ParseBuildRequestResult = { ok: true; value: BuildRequest } | { ok: false; error: string };

export function parseBuildRequest(body: unknown): ParseBuildRequestResult {
  if (typeof body !== 'object' || body === null) return fail('Request body must be a JSON object.');
  const { kind, imageBase64, note } = body as Record<string, unknown>;
  if (kind !== 'sketch' && kind !== 'screenshot') return fail('kind must be "sketch" or "screenshot".');
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) return fail('imageBase64 is required.');
  if (Math.floor((imageBase64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return fail('Image is too large (max 5 MB). Select less, or crop the screenshot, and try again.');
  }
  if (note !== undefined && typeof note !== 'string') return fail('note must be a string.');
  return { ok: true, value: { kind, imageBase64, note: (note ?? '').slice(0, MAX_NOTE_CHARS) } };
}

function fail(error: string): ParseBuildRequestResult {
  return { ok: false, error };
}
