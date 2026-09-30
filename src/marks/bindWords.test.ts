import { describe, expect, it } from 'vitest';
import { BIND_PAD_MS, bindWords, timeline, toSpeech } from './bindWords';
import { said } from './testing';

const m = (n: number, t0: number, t1 = t0 + 400) => ({ n, t0, t1 });

describe('bindWords (spec §4.2)', () => {
  it('gives words said while drawing to that mark', () => {
    expect(toSpeech(bindWords([m(1, 1000)], said('make these smaller', 900)))).toEqual([{ mark: 1, text: 'make these smaller' }]);
  });
  it('keeps words within 0.4 s of the drawing, and no further', () => {
    const words = [
      { text: 'near', t0: 1400 + BIND_PAD_MS - 50, t1: 1400 + BIND_PAD_MS + 200 },
      { text: 'far', t0: 1400 + BIND_PAD_MS + 300, t1: 2400 },
    ];
    expect(toSpeech(bindWords([m(1, 1000)], words))).toEqual([
      { mark: 1, text: 'near' },
      { mark: null, text: 'far' },
    ]);
  });
  it('splits speech-only runs where a mark was drawn between them', () => {
    const words = [...said('make it dark', 0), ...said('and bigger', 5000)];
    expect(toSpeech(bindWords([m(1, 3000)], words))).toEqual([
      { mark: null, text: 'make it dark' },
      { mark: null, text: 'and bigger' },
    ]);
    expect(toSpeech(bindWords([], words))).toEqual([{ mark: null, text: 'make it dark and bigger' }]);
  });
  it('gives a word near two marks to the closer one', () => {
    expect(toSpeech(bindWords([m(1, 1000), m(2, 1900)], [{ text: 'here', t0: 1750, t1: 1850 }]))).toEqual([{ mark: 2, text: 'here' }]);
  });
  it('accepts words in any order', () => {
    const words = said('make these smaller', 900).reverse();
    expect(toSpeech(bindWords([m(1, 1000)], words))).toEqual([{ mark: 1, text: 'make these smaller' }]);
  });
  it('orders marks and speech-only runs by time for the panel', () => {
    const marks = [m(1, 1000), m(2, 4000)];
    const runs = bindWords(marks, [...said('these', 1000), ...said('and make it premium', 6000)]);
    expect(timeline(marks, runs).map((r) => (r.kind === 'mark' ? `${r.mark.n}:${r.said}` : `"${r.text}"`))).toEqual([
      '1:these',
      '2:',
      '"and make it premium"',
    ]);
  });
});
