import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_NOTE_CHARS, parseBuildRequest } from './parseBuildRequest';

describe('parseBuildRequest', () => {
  it('accepts a valid body and defaults the note', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA' })).toEqual({
      ok: true,
      value: { kind: 'sketch', imageBase64: 'AAAA', note: '' },
    });
  });
  it('rejects non-objects', () => {
    expect(parseBuildRequest(null)).toMatchObject({ ok: false });
    expect(parseBuildRequest('x')).toMatchObject({ ok: false });
  });
  it('rejects an unknown kind', () => {
    expect(parseBuildRequest({ kind: 'video', imageBase64: 'AAAA' })).toMatchObject({ ok: false });
  });
  it('rejects a missing image', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: '' })).toMatchObject({ ok: false });
  });
  it('rejects images over 5 MB with a readable message', () => {
    const tooBig = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) * (4 / 3)) + 4);
    const result = parseBuildRequest({ kind: 'screenshot', imageBase64: tooBig });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain('5 MB');
  });
  it('rejects a non-string note and truncates a long one', () => {
    expect(parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA', note: 5 })).toMatchObject({ ok: false });
    const result = parseBuildRequest({ kind: 'sketch', imageBase64: 'AAAA', note: 'x'.repeat(MAX_NOTE_CHARS + 50) });
    expect(result.ok && result.value.note.length).toBe(MAX_NOTE_CHARS);
  });
});
