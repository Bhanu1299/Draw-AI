import { rectGap, unionRects, type Rect } from '@/shared/geometry';
import type { Stroke } from './types';

export const GROUP_GAP_MS = 1200;
export const GROUP_DISTANCE_PX = 80;

export interface MarkGroup {
  strokes: Stroke[];
  bounds: Rect;
  t0: number;
  t1: number;
}

/** Consecutive strokes drawn close in time and space form one mark (a circle plus its arrow). */
export function groupStrokes(strokes: Stroke[]): MarkGroup[] {
  const groups: MarkGroup[] = [];
  for (const s of [...strokes].sort((a, b) => a.t0 - b.t0)) {
    const last = groups.at(-1);
    if (last && s.t0 - last.t1 < GROUP_GAP_MS && rectGap(s.bounds, last.bounds) <= GROUP_DISTANCE_PX) {
      last.strokes.push(s);
      last.bounds = unionRects([last.bounds, s.bounds]);
      last.t1 = Math.max(last.t1, s.t1);
    } else {
      groups.push({ strokes: [s], bounds: s.bounds, t0: s.t0, t1: s.t1 });
    }
  }
  return groups;
}
