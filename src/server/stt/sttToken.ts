import type { SttTokenResponse } from '@/shared/types';

export const SCRIBE_TOKEN_URL = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';
const TIMEOUT_MS = 10_000;

export const VOICE_NOT_SET_UP =
  "Voice isn't set up: add ELEVENLABS_API_KEY to .env.local and restart the server. You can type your instruction meanwhile.";

/** Mint a single-use Scribe token, so the browser can stream audio without ever seeing our key. */
export async function mintSttToken(env: Record<string, string | undefined>, fetchFn: typeof fetch = fetch): Promise<SttTokenResponse> {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) return { ok: false, error: VOICE_NOT_SET_UP };
  let res: Response;
  try {
    res = await fetchFn(SCRIBE_TOKEN_URL, { method: 'POST', headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, error: "Couldn't reach the voice service. Check your connection, or type your instruction." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'The voice service rejected ELEVENLABS_API_KEY. Check the key and its speech-to-text permission.' };
  }
  if (!res.ok) return { ok: false, error: `The voice service failed (HTTP ${res.status}). Try again, or type your instruction.` };
  const body = (await res.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || body.token === '') {
    return { ok: false, error: 'The voice service sent an unexpected reply. Try again, or type your instruction.' };
  }
  return { ok: true, token: body.token };
}
