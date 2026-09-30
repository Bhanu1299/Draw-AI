import { getArrowInfo, type Editor, type TLArrowShape, type TLShape } from 'tldraw';
import { getFrameElements } from '@/frame/elementRegistry';
import type { FrameShape } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { Point } from '@/shared/geometry';
import { readMarkMeta } from './markMeta';
import { toPageElements } from './pageElements';
import type { FrameInfo, Stroke, StrokeKind } from './types';

/** Marks the user has drawn and not yet sent (or built), in page coordinates. */
export function readPendingStrokes(editor: Editor): Stroke[] {
  return editor.getCurrentPageShapes().flatMap((shape) => {
    const mark = readMarkMeta(shape);
    if (!mark || mark.used) return [];
    const stroke = toStroke(editor, shape, mark.t0, mark.t1);
    return stroke ? [stroke] : [];
  });
}

function toStroke(editor: Editor, shape: TLShape, t0: number, t1: number): Stroke | null {
  const box = editor.getShapePageBounds(shape);
  if (!box) return null;
  let local: Point[];
  if (shape.type === 'arrow') {
    const info = getArrowInfo(editor, shape as TLArrowShape);
    if (!info) return null;
    local = [info.start.point, info.end.point];
  } else {
    local = editor.getShapeGeometry(shape).vertices;
  }
  const text = editor.getShapeUtil(shape).getText(shape)?.trim();
  return {
    shapeId: shape.id,
    kind: strokeKind(shape),
    points: editor.getShapePageTransform(shape).applyToPoints(local).map(({ x, y }) => ({ x, y })),
    bounds: { x: box.x, y: box.y, w: box.w, h: box.h },
    t0,
    t1,
    ...(text ? { text } : {}),
  };
}

function strokeKind(shape: TLShape): StrokeKind {
  switch (shape.type) {
    case 'draw':
    case 'highlight':
      return 'draw';
    case 'arrow':
    case 'line':
    case 'text':
    case 'note':
      return shape.type;
    case 'geo': {
      const geo = (shape.props as { geo?: string }).geo;
      if (geo === 'ellipse' || geo === 'oval') return 'ellipse';
      return geo === 'rectangle' ? 'rectangle' : 'other';
    }
    default:
      return 'other';
  }
}

/** Built pages that are ready, with their element maps moved to page coordinates. */
export function readFrames(editor: Editor): FrameInfo[] {
  return editor.getCurrentPageShapes().flatMap((shape) => {
    if (shape.type !== FRAME_TYPE) return [];
    const frame = shape as FrameShape;
    const box = editor.getShapePageBounds(frame);
    if (!box || frame.props.status !== 'ready') return [];
    const elements = getFrameElements(frame.id);
    const transform = editor.getShapePageTransform(frame);
    return [
      {
        id: frame.id,
        bounds: { x: box.x, y: box.y, w: box.w, h: box.h },
        elements: elements ? toPageElements(elements, (p) => transform.applyToPoint(p)) : null,
      },
    ];
  });
}

/** The frame when exactly one frame is selected: target of a whole-page instruction. */
export function selectedFrameId(editor: Editor): string | null {
  const ids = editor.getSelectedShapeIds();
  const only = ids.length === 1 ? editor.getShape(ids[0]) : undefined;
  return only?.type === FRAME_TYPE ? only.id : null;
}
