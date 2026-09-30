import type { Editor, JsonObject, TLShapeId } from 'tldraw';

export const MARK_META_KEY = 'drawaiMark';
/** Shapes that count as marks when the user draws them. Images and frames never do. */
export const MARK_SHAPE_TYPES: ReadonlySet<string> = new Set(['draw', 'highlight', 'geo', 'arrow', 'line', 'text', 'note']);

// A type alias (not an interface) so it is assignable to tldraw's JsonObject meta.
export type MarkMeta = { t0: number; t1: number; used: boolean };

export function readMarkMeta(shape: { meta: unknown }): MarkMeta | null {
  const value = (shape.meta as Record<string, unknown> | undefined)?.[MARK_META_KEY];
  if (typeof value !== 'object' || value === null) return null;
  const { t0, t1, used } = value as Record<string, unknown>;
  if (typeof t0 !== 'number' || typeof t1 !== 'number') return null;
  return { t0, t1, used: used === true };
}

export function withMarkMeta<S extends { meta: JsonObject }>(shape: S, mark: MarkMeta): S {
  return { ...shape, meta: { ...shape.meta, [MARK_META_KEY]: { ...mark } } };
}

/**
 * Tag every drawing shape the user creates as a pending mark, and stretch its end time while a pen
 * stroke is still being drawn. Restored shapes (undo, revert) keep their original tag.
 */
export function registerMarkTracking(editor: Pick<Editor, 'sideEffects'>, now: () => number = Date.now): () => void {
  const offCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    if (source !== 'user' || !MARK_SHAPE_TYPES.has(shape.type) || readMarkMeta(shape)) return shape;
    const t = now();
    return withMarkMeta(shape, { t0: t, t1: t, used: false });
  });
  const offChange = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next, source) => {
    const mark = readMarkMeta(next);
    if (source !== 'user' || !mark || mark.used || !isBeingDrawn(prev)) return next;
    return withMarkMeta(next, { ...mark, t1: now() });
  });
  return () => {
    offCreate();
    offChange();
  };
}

function isBeingDrawn(shape: { type: string; props: unknown }): boolean {
  return (shape.type === 'draw' || shape.type === 'highlight') && (shape.props as { isComplete?: boolean }).isComplete === false;
}

/** Stop shapes counting as marks, e.g. a sketch that was just built into a page. */
export function markShapesUsed(editor: Editor, ids: readonly TLShapeId[]): void {
  const updates = ids.flatMap((id) => {
    const shape = editor.getShape(id);
    const mark = shape ? readMarkMeta(shape) : null;
    return shape && mark ? [{ id: shape.id, type: shape.type, meta: withMarkMeta(shape, { ...mark, used: true }).meta }] : [];
  });
  if (updates.length > 0) editor.run(() => editor.updateShapes(updates), { history: 'ignore' });
}
