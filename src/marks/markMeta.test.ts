import type { Editor } from 'tldraw';
import { describe, expect, it } from 'vitest';
import { MARK_META_KEY, readMarkMeta, registerMarkTracking } from './markMeta';

type Shape = { id: string; type: string; meta: Record<string, unknown>; props: Record<string, unknown> };
type Create = (shape: Shape, source: 'user' | 'remote') => Shape;
type Change = (prev: Shape, next: Shape, source: 'user' | 'remote') => Shape;

function fakeEditor() {
  const handlers: { create?: Create; change?: Change } = {};
  const editor = {
    sideEffects: {
      registerBeforeCreateHandler: (_: string, h: Create) => ((handlers.create = h), () => {}),
      registerBeforeChangeHandler: (_: string, h: Change) => ((handlers.change = h), () => {}),
    },
  } as unknown as Pick<Editor, 'sideEffects'>;
  return { editor, handlers };
}

const draw = (meta: Record<string, unknown> = {}, isComplete = false): Shape => ({
  id: 'shape:a', type: 'draw', meta, props: { isComplete },
});

describe('markMeta', () => {
  it('reads valid mark meta and ignores anything else', () => {
    expect(readMarkMeta({ meta: { [MARK_META_KEY]: { t0: 1, t1: 2, used: false } } })).toEqual({ t0: 1, t1: 2, used: false });
    expect(readMarkMeta({ meta: { [MARK_META_KEY]: { t0: 'x' } } })).toBeNull();
    expect(readMarkMeta({ meta: {} })).toBeNull();
  });
  it('tags shapes the user creates, and only drawing shapes', () => {
    const { editor, handlers } = fakeEditor();
    registerMarkTracking(editor, () => 1000);
    expect(readMarkMeta(handlers.create!(draw(), 'user'))).toEqual({ t0: 1000, t1: 1000, used: false });
    expect(readMarkMeta(handlers.create!(draw(), 'remote'))).toBeNull();
    expect(readMarkMeta(handlers.create!({ ...draw(), type: 'image' }, 'user'))).toBeNull();
  });
  it('keeps existing mark meta when a mark is restored (undo, revert)', () => {
    const { editor, handlers } = fakeEditor();
    registerMarkTracking(editor, () => 5000);
    const restored = draw({ [MARK_META_KEY]: { t0: 10, t1: 20, used: false } });
    expect(readMarkMeta(handlers.create!(restored, 'user'))).toEqual({ t0: 10, t1: 20, used: false });
  });
  it('stretches t1 only while a pen stroke is still being drawn', () => {
    const { editor, handlers } = fakeEditor();
    let now = 1000;
    registerMarkTracking(editor, () => now);
    const drawing = draw({ [MARK_META_KEY]: { t0: 1000, t1: 1000, used: false } }, false);
    now = 1600;
    expect(readMarkMeta(handlers.change!(drawing, drawing, 'user'))?.t1).toBe(1600);
    const done = draw({ [MARK_META_KEY]: { t0: 1000, t1: 1000, used: false } }, true);
    now = 9000;
    expect(readMarkMeta(handlers.change!(done, done, 'user'))?.t1).toBe(1000);
  });
});
