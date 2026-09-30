export type SttError = { kind: 'no-speech' } | { kind: 'failed'; message: string };

const failed = (message: string): SttError => ({ kind: 'failed', message });

/** Turn a Scribe error message (or a local error) into what the user should see. */
export function sttError(data: unknown): SttError {
  const record = (typeof data === 'object' && data !== null ? data : {}) as { message_type?: unknown; error?: unknown };
  const detail = typeof record.error === 'string' ? record.error : data instanceof Error ? data.message : '';
  switch (record.message_type) {
    case 'insufficient_audio_activity':
    case 'commit_throttled': // too little audio since the last commit: nothing new to transcribe
      return { kind: 'no-speech' };
    case 'auth_error':
      return failed('The voice service rejected the session. Check ELEVENLABS_API_KEY, or type your instruction.');
    case 'quota_exceeded':
      return failed('Voice credits ran out (ElevenLabs quota). Type your instruction instead.');
    case 'rate_limited':
    case 'resource_exhausted':
    case 'queue_overflow':
      return failed('The voice service is busy. Wait a moment and press ● Start again.');
    case 'session_time_limit_exceeded':
      return failed('That recording ran too long. Keep one instruction under a minute.');
    default:
      return failed(`Voice stopped working${detail ? ` (${detail})` : ''}. Press ● Start to try again, or type below.`);
  }
}
