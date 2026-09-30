import { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } from '@elevenlabs/client';
import { STT_SAMPLE_RATE } from './pcm';
import type { SttEvents, SttSocket } from './recorder';
import { sttError } from './sttErrors';

export const SCRIBE_MODEL = 'scribe_v2_realtime';

/** Words people use about UI, to bias recognition (max 50, each ≤ 20 characters). */
export const UI_KEYTERMS = [
  'navbar', 'nav', 'hero', 'CTA', 'header', 'footer', 'sidebar', 'card', 'cards', 'button', 'padding', 'margin',
  'gradient', 'Tailwind', 'testimonials', 'pricing', 'dropdown', 'modal', 'tooltip', 'icon', 'font', 'bold',
  'rounded', 'shadow', 'layout', 'grid', 'column', 'section',
];

/** ElevenLabs Scribe v2 Realtime: manual commit on Stop, word timestamps, filler words removed. */
export function connectScribe(token: string, events: SttEvents): SttSocket {
  const connection = Scribe.connect({
    token,
    modelId: SCRIBE_MODEL,
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: STT_SAMPLE_RATE,
    commitStrategy: CommitStrategy.MANUAL,
    includeTimestamps: true,
    noVerbatim: true,
    keyterms: UI_KEYTERMS,
  });
  // Audio sent before session_started could be dropped: session_started is "open" for the recorder.
  connection.on(RealtimeEvents.SESSION_STARTED, () => events.onOpen());
  connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (m) => events.onPartial(m.text));
  connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, (m) => events.onWords(m.words ?? []));
  // ERROR fires for every specific error type too, so this one listener sees them all.
  connection.on(RealtimeEvents.ERROR, (m) => events.onError(sttError(m)));
  connection.on(RealtimeEvents.CLOSE, () => events.onClose());
  return {
    send: (audioBase64) => connection.send({ audioBase64 }),
    commit: () => connection.commit(),
    close: () => connection.close(),
  };
}
