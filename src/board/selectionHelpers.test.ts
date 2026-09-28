import type { TLShapeId } from 'tldraw';
import { describe, expect, it } from 'vitest';
import { checkSelection, findInterruptedFrames, fitScale } from './selectionHelpers';

const id = (s: string) => `shape:${s}` as TLShapeId;

describe('checkSelection', () => {
  it('asks for a selection when nothing is selected', () => {
    expect(checkSelection([])).toEqual({ ok: false, error: 'Select a sketch or a screenshot first.' });
  });
  it('treats a single image as a screenshot', () => {
    expect(checkSelection([{ type: 'image' }])).toEqual({ ok: true, kind: 'screenshot' });
  });
  it('treats drawings, or an image with drawings on it, as a sketch', () => {
    expect(checkSelection([{ type: 'draw' }, { type: 'geo' }])).toEqual({ ok: true, kind: 'sketch' });
    expect(checkSelection([{ type: 'image' }, { type: 'arrow' }])).toEqual({ ok: true, kind: 'sketch' });
  });
  it('refuses selections that include a built frame', () => {
    const result = checkSelection([{ type: 'draw' }, { type: 'drawai-frame' }]);
    expect(result.ok).toBe(false);
  });
});

describe('fitScale', () => {
  it('never upscales', () => {
    expect(fitScale(400, 300, 1600, 8000)).toBe(1);
  });
  it('shrinks to fit the tighter dimension', () => {
    expect(fitScale(3200, 1000, 1600, 8000)).toBe(0.5);
    expect(fitScale(1280, 16000, 1600, 8000)).toBe(0.5);
  });
  it('returns 1 for empty bounds', () => {
    expect(fitScale(0, 0, 1600, 8000)).toBe(1);
  });
});

describe('findInterruptedFrames', () => {
  it('returns frames still marked as building', () => {
    const shapes = [
      { id: id('a'), type: 'drawai-frame', props: { status: 'building' } },
      { id: id('b'), type: 'drawai-frame', props: { status: 'ready' } },
      { id: id('c'), type: 'draw', props: { status: 'building' } },
    ];
    expect(findInterruptedFrames(shapes)).toEqual([id('a')]);
  });
});
