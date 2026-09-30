import type { PreviewElement } from '@/preview/previewMessages';
import type { Point, Rect } from '@/shared/geometry';

export type StrokeKind = 'draw' | 'ellipse' | 'rectangle' | 'arrow' | 'line' | 'text' | 'note' | 'other';

/** One user-drawn shape, in page coordinates. */
export interface Stroke {
  shapeId: string;
  kind: StrokeKind;
  /** Pen path, shape outline, or [tail, head] for arrows. */
  points: Point[];
  bounds: Rect;
  /** Epoch ms: when drawing started, and when the stroke was last extended. */
  t0: number;
  t1: number;
  /** Text written in a text shape, note or labelled box. */
  text?: string;
}

/** A built page on the board. */
export interface FrameInfo {
  id: string;
  bounds: Rect;
  /** Tagged elements in page coordinates; null until the preview reports them. */
  elements: PreviewElement[] | null;
}

/** One spoken word, on the same clock as strokes (epoch ms). */
export interface Word {
  text: string;
  t0: number;
  t1: number;
}
