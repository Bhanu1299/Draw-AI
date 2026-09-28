import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, MAX_IMAGES, MAX_NOTE_CHARS, parseBuildRequest } from './parseBuildRequest';

describe('parseBuildRequest', () => {
  it('accepts a valid body and defaults the note', () => {
    expect(parseBuildRequest({ kind: 'sketch', images: ['AAAA', 'BBBB'] })).toEqual({
      ok: true,
      value: { kind: 'sketch', images: ['AAAA', 'BBBB'], note: '' },
    });
  });
  it('rejects non-objects', () => {
    expect(parseBuildRequest(null)).toMatchObject({ ok: false });
    expect(parseBuildRequest('x')).toMatchObject({ ok: false });
  });
  it('rejects an unknown kind', () => {
    expect(parseBuildRequest({ kind: 'video', images: ['AAAA'] })).toMatchObject({ ok: false });
  });
  it('rejects missing, empty or non-string images', () => {
    expect(parseBuildRequest({ kind: 'sketch' })).toMatchObject({ ok: false });
    expect(parseBuildRequest({ kind: 'sketch', images: [] })).toMatchObject({ ok: false });
    expect(parseBuildRequest({ kind: 'sketch', images: [''] })).toMatchObject({ ok: false });
    expect(parseBuildRequest({ kind: 'sketch', images: [42] })).toMatchObject({ ok: false });
  });
  it('rejects too many image slices', () => {
    const images = Array.from({ length: MAX_IMAGES + 1 }, () => 'AAAA');
    expect(parseBuildRequest({ kind: 'screenshot', images })).toMatchObject({ ok: false });
  });
  it('rejects any slice over 5 MB with a readable message', () => {
    const tooBig = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 1) * (4 / 3)) + 4);
    const result = parseBuildRequest({ kind: 'screenshot', images: ['AAAA', tooBig] });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain('5 MB');
  });
  it('rejects a non-string note and truncates a long one', () => {
    expect(parseBuildRequest({ kind: 'sketch', images: ['AAAA'], note: 5 })).toMatchObject({ ok: false });
    const result = parseBuildRequest({ kind: 'sketch', images: ['AAAA'], note: 'x'.repeat(MAX_NOTE_CHARS + 50) });
    expect(result.ok && result.value.note.length).toBe(MAX_NOTE_CHARS);
  });
});
