import { describe, expect, it, vi } from 'vitest';
import { mintSttToken, SCRIBE_TOKEN_URL, VOICE_NOT_SET_UP } from './sttToken';

const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe('mintSttToken', () => {
  it('explains how to set up voice when the key is missing', async () => {
    expect(await mintSttToken({})).toEqual({ ok: false, error: VOICE_NOT_SET_UP });
    expect(await mintSttToken({ ELEVENLABS_API_KEY: '  ' })).toEqual({ ok: false, error: VOICE_NOT_SET_UP });
  });
  it('mints a single-use token with the key, server side', async () => {
    const fetchFn = vi.fn(reply({ token: 'abc' }));
    expect(await mintSttToken({ ELEVENLABS_API_KEY: 'k' }, fetchFn)).toEqual({ ok: true, token: 'abc' });
    expect(fetchFn).toHaveBeenCalledWith(SCRIBE_TOKEN_URL, expect.objectContaining({ method: 'POST', headers: { 'xi-api-key': 'k' } }));
  });
  it('turns failures into messages that say what to do', async () => {
    const env = { ELEVENLABS_API_KEY: 'k' };
    expect(await mintSttToken(env, reply({}, 401))).toEqual({ ok: false, error: expect.stringContaining('rejected') });
    expect(await mintSttToken(env, reply({}, 500))).toEqual({ ok: false, error: expect.stringContaining('HTTP 500') });
    expect(await mintSttToken(env, reply({ nope: 1 }))).toEqual({ ok: false, error: expect.any(String) });
    expect(
      await mintSttToken(env, async () => {
        throw new TypeError('fetch failed');
      }),
    ).toEqual({ ok: false, error: expect.stringContaining("Couldn't reach") });
  });
});
