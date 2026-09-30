import { describe, expect, it } from 'vitest';
import { toWords, transcriptOf } from './words';

describe('toWords', () => {
  it('puts STT words on the stroke clock and skips spacing, events and untimed words', () => {
    const words = toWords(
      [
        { text: 'Make', start: 0.2, end: 0.4, type: 'word' },
        { text: ' ', start: 0.4, end: 0.5, type: 'spacing' },
        { text: '(laughs)', start: 0.5, end: 0.9, type: 'audio_event' },
        { text: 'this', type: 'word' },
        { text: ' bigger ', start: 1, end: 1.3, type: 'word' },
      ],
      10_000,
    );
    expect(words).toEqual([
      { text: 'Make', t0: 10_200, t1: 10_400 },
      { text: 'bigger', t0: 11_000, t1: 11_300 },
    ]);
    expect(transcriptOf(words)).toBe('Make bigger');
  });
});
