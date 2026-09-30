import type { Word } from '@/marks/types';

/** A word as the STT returns it: seconds from the start of the audio. Spacing and audio events are skipped. */
export interface SttWord {
  text: string;
  start?: number;
  end?: number;
  type: string;
}

/** Move STT words onto the stroke clock. `audioStartMs` is when the first audio sample was captured. */
export function toWords(raw: SttWord[], audioStartMs: number): Word[] {
  return raw.flatMap((w) => {
    const text = w.text.trim();
    if (w.type !== 'word' || !text || typeof w.start !== 'number' || typeof w.end !== 'number') return [];
    return [{ text, t0: audioStartMs + w.start * 1000, t1: audioStartMs + Math.max(w.start, w.end) * 1000 }];
  });
}

export const transcriptOf = (words: Word[]): string => words.map((w) => w.text).join(' ');
