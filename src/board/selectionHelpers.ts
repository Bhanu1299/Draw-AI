import type { TLShapeId } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { BuildKind } from '@/shared/types';

export const MAX_EXPORT_W = 1600;
// 4000px keeps tall screenshots as PNGs under the 5 MB upload cap; the model downsamples beyond ~2.5k anyway.
export const MAX_EXPORT_H = 4000;
/** Padding (per side) added around the selection when exporting it as an image. */
export const EXPORT_PADDING = 16;

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

/** Export scale for a selection of w × h page units, accounting for the padding added around it. */
export function exportScale(w: number, h: number): number {
  return fitScale(w + 2 * EXPORT_PADDING, h + 2 * EXPORT_PADDING, MAX_EXPORT_W, MAX_EXPORT_H);
}

/** Frames persisted mid-build (e.g. the tab was reloaded) that will never finish. */
export function findInterruptedFrames(
  shapes: ReadonlyArray<{ id: TLShapeId; type: string; props: unknown }>,
): TLShapeId[] {
  return shapes
    .filter((s) => s.type === FRAME_TYPE && (s.props as { status?: unknown }).status === 'building')
    .map((s) => s.id);
}
