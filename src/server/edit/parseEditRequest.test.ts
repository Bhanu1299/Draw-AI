import { describe, expect, it } from 'vitest';
import { parseEditRequest, MAX_FILES, MAX_INSTRUCTION_CHARS, MAX_SPEECH_CHARS, MAX_SPEECH_RUNS } from './parseEditRequest';

const files = { 'App.tsx': 'export default function App() { return null; }\n' };
const el = { src: 'App.tsx:1:1', tag: 'div', text: '' };
const segment = { n: 1, gesture: 'circle', target: { kind: 'elements', elements: [el] }, unsure: false, wrote: [] };
const region = {
  n: 2, gesture: 'sketch', unsure: true, wrote: ['Hi'], inkPng: 'AAAA',
  target: { kind: 'region', region: { width: 10, height: 10, left: 0, top: 0, fullWidth: false, outside: null, inside: el, elementAbove: null, elementBelow: null, covers: [el] } },
};

describe('parseEditRequest', () => {
  it('accepts a valid request and trims the instruction to the cap', () => {
    const result = parseEditRequest({ files, segments: [segment, region], instruction: 'x'.repeat(MAX_INSTRUCTION_CHARS + 5) });
    expect(result.ok && result.value.instruction.length).toBe(MAX_INSTRUCTION_CHARS);
    expect(result.ok && result.value.segments).toHaveLength(2);
  });
  it('accepts a crash-fix request with no marks or instruction', () => {
    expect(parseEditRequest({ files, segments: [], instruction: '', runtimeError: 'boom' }).ok).toBe(true);
  });
  it('rejects bad bodies with a readable error', () => {
    expect(parseEditRequest(null)).toEqual({ ok: false, error: expect.any(String) });
    expect(parseEditRequest({ files: {}, segments: [], instruction: 'x' })).toEqual({ ok: false, error: expect.stringContaining('App.tsx') });
    const many = Object.fromEntries(Array.from({ length: MAX_FILES + 1 }, (_, i) => [`F${i}.tsx`, '']));
    expect(parseEditRequest({ files: { ...many, ...files }, segments: [], instruction: 'x' }).ok).toBe(false);
    expect(parseEditRequest({ files, segments: [{ ...segment, gesture: 'poke' }], instruction: 'x' }).ok).toBe(false);
    expect(parseEditRequest({ files, segments: [], instruction: '   ' })).toEqual({ ok: false, error: expect.stringContaining('Say what to change') });
  });
  it('accepts speech runs, with marks or alone', () => {
    const speech = [{ mark: 1, text: 'smaller' }, { mark: null, text: 'and more premium' }];
    expect(parseEditRequest({ files, segments: [segment], instruction: '', speech })).toMatchObject({ ok: true, value: { speech } });
    expect(parseEditRequest({ files, segments: [], instruction: '', speech: [{ mark: null, text: 'dark mode' }] }).ok).toBe(true);
    const none = parseEditRequest({ files, segments: [segment], instruction: '' });
    expect(none.ok && 'speech' in none.value).toBe(false);
  });
  it('rejects malformed or oversized speech', () => {
    const bad = [
      'hi',
      [{ mark: 0, text: 'x' }],
      [{ mark: 1.5, text: 'x' }],
      [{ mark: null, text: '   ' }],
      [{ mark: null }],
      Array.from({ length: MAX_SPEECH_RUNS + 1 }, () => ({ mark: null, text: 'x' })),
      [{ mark: null, text: 'x'.repeat(MAX_SPEECH_CHARS + 1) }],
    ];
    for (const speech of bad) {
      expect(parseEditRequest({ files, segments: [segment], instruction: '', speech })).toEqual({ ok: false, error: expect.stringContaining('speech') });
    }
  });
});
