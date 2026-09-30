import { describe, expect, it } from 'vitest';
import { sttError } from './sttErrors';

describe('sttError', () => {
  it('reads "no speech" as an empty result, not a failure', () => {
    expect(sttError({ message_type: 'insufficient_audio_activity', error: 'x' })).toEqual({ kind: 'no-speech' });
  });
  it('says what to do for each kind of failure', () => {
    expect(sttError({ message_type: 'quota_exceeded', error: 'x' })).toEqual({ kind: 'failed', message: expect.stringContaining('credits') });
    expect(sttError({ message_type: 'auth_error', error: 'x' })).toEqual({ kind: 'failed', message: expect.stringContaining('ELEVENLABS_API_KEY') });
    expect(sttError({ message_type: 'rate_limited', error: 'x' })).toEqual({ kind: 'failed', message: expect.stringContaining('busy') });
    expect(sttError({ message_type: 'transcriber_error', error: 'boom' })).toEqual({ kind: 'failed', message: expect.stringContaining('boom') });
    expect(sttError(new Error('socket died'))).toEqual({ kind: 'failed', message: expect.stringContaining('socket died') });
    expect(sttError(undefined)).toEqual({ kind: 'failed', message: expect.stringContaining('● Start') });
  });
});
