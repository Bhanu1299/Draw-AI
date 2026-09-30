import type { SpeechRun } from '@/shared/types';
import type { Word } from './types';

/** A word said this close to a mark's drawing time belongs to that mark (spec §4.2). */
export const BIND_PAD_MS = 400;

export interface TimedMark {
  n: number;
  t0: number;
  t1: number;
}

export interface BoundRun extends SpeechRun {
  t0: number;
  t1: number;
}

/**
 * Split what was said into runs, in time order. Words said while a mark was drawn (± 0.4 s) go to that
 * mark; the rest form speech-only runs, which break wherever a mark was drawn between two words.
 */
export function bindWords(marks: TimedMark[], words: Word[]): BoundRun[] {
  const runs: BoundRun[] = [];
  for (const word of [...words].sort((a, b) => a.t0 - b.t0)) {
    const mark = ownerOf(word, marks);
    const last = runs.at(-1);
    const markBetween = !!last && marks.some((m) => m.t0 >= last.t1 && m.t0 <= word.t0);
    if (last && last.mark === mark && (mark !== null || !markBetween)) {
      last.text += ` ${word.text}`;
      last.t1 = Math.max(last.t1, word.t1);
    } else {
      runs.push({ mark, text: word.text, t0: word.t0, t1: word.t1 });
    }
  }
  return runs;
}

/** The closest mark whose padded window the word overlaps; on a tie, the earlier mark. */
function ownerOf(word: Word, marks: TimedMark[]): number | null {
  let best: TimedMark | null = null;
  let bestGap = Infinity;
  for (const m of marks) {
    if (word.t1 < m.t0 - BIND_PAD_MS || word.t0 > m.t1 + BIND_PAD_MS) continue;
    const gap = Math.max(0, m.t0 - word.t1, word.t0 - m.t1);
    if (gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best ? best.n : null;
}

export const toSpeech = (runs: BoundRun[]): SpeechRun[] => runs.map(({ mark, text }) => ({ mark, text }));

export type TimelineRow<M> = { kind: 'mark'; mark: M; said: string } | { kind: 'speech'; text: string };

/** Marks (with what was said while drawing them) and speech-only runs, in the order they happened. */
export function timeline<M extends TimedMark>(marks: M[], runs: BoundRun[]): TimelineRow<M>[] {
  const rows: Array<{ t: number; row: TimelineRow<M> }> = [
    ...marks.map((mark) => ({
      t: mark.t0,
      row: {
        kind: 'mark' as const,
        mark,
        said: runs
          .filter((r) => r.mark === mark.n)
          .map((r) => r.text)
          .join(' … '),
      },
    })),
    ...runs.filter((r) => r.mark === null).map((r) => ({ t: r.t0, row: { kind: 'speech' as const, text: r.text } })),
  ];
  return rows.sort((a, b) => a.t - b.t).map((r) => r.row);
}
