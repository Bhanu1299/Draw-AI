import type { TLShapeId } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { BuildKind } from '@/shared/types';

export const MAX_EXPORT_W = 1600;
export const MAX_EXPORT_H = 8000;

export type SelectionCheck = { ok: true; kind: BuildKind } | { ok: false; error: string };

export function checkSelection(shapes: ReadonlyArray<{ type: string }>): SelectionCheck {
  if (shapes.length === 0) return { ok: false, error: 'Select a sketch or a screenshot first.' };
  if (shapes.some((s) => s.type === FRAME_TYPE)) {
    return { ok: false, error: "Built pages can't be rebuilt yet. Select only your sketch or screenshot." };
  }
  const kind: BuildKind = shapes.length === 1 && shapes[0].type === 'image' ? 'screenshot' : 'sketch';
  return { ok: true, kind };
}

/** Export scale that keeps the image within maxW × maxH without upscaling. */
export function fitScale(w: number, h: number, maxW: number, maxH: number): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, maxW / w, maxH / h);
}

/** Frames persisted mid-build (e.g. the tab was reloaded) that will never finish. */
export function findInterruptedFrames(
  shapes: ReadonlyArray<{ id: TLShapeId; type: string; props: unknown }>,
): TLShapeId[] {
  return shapes
    .filter((s) => s.type === FRAME_TYPE && (s.props as { status?: unknown }).status === 'building')
    .map((s) => s.id);
}
