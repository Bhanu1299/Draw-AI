import { rectGap, type Rect } from '@/shared/geometry';
import { parseSrc, targetElements } from '@/shared/targets';
import type { Gesture, Segment } from '@/shared/types';
import { classifyMark } from './classify';
import { groupStrokes, type MarkGroup } from './groupStrokes';
import { hitTest, type HitResult } from './hitTest';
import type { FrameInfo, Stroke } from './types';

/** Marks further than this from every page are ignored (they are sketches or notes). */
export const FRAME_REACH_PX = 300;

export interface PlannedMark {
  n: number;
  shapeIds: string[];
  bounds: Rect;
  /** When the mark was drawn (epoch ms), to bind spoken words to it. */
  t0: number;
  t1: number;
  gesture: Gesture;
  hit: HitResult;
  wrote: string[];
  freehand: boolean;
}

export interface EditPlan {
  frameId: string;
  marks: PlannedMark[];
}

export type PlanResult =
  | { ok: true; plan: EditPlan }
  | { ok: false; reason: 'no-marks' | 'no-frame' | 'loading'; message: string };

/** Turn pending strokes into a numbered edit plan for one page. Pure: the panel shows exactly what gets sent. */
export function planEdit(strokes: Stroke[], frames: FrameInfo[], selectedFrameId: string | null): PlanResult {
  const groups = groupStrokes(strokes);
  const owners = groups.map((g) => nearestFrame(g, frames));
  // Nothing drawn and nothing selected: a board with one page means that page.
  const fallback = frames.find((f) => f.id === selectedFrameId) ?? (groups.length === 0 && frames.length === 1 ? frames[0] : undefined);
  const frame = busiestFrame(owners) ?? fallback;
  if (!frame) {
    return groups.length > 0
      ? { ok: false, reason: 'no-frame', message: 'Draw on or next to a page to change it.' }
      : { ok: false, reason: 'no-marks', message: 'Circle, point at, cross out, underline or sketch on a page, then say what to change.' };
  }
  const mine = groups.filter((_, i) => owners[i] === frame);
  if (mine.length > 0 && frame.elements === null) {
    return { ok: false, reason: 'loading', message: 'The page is still loading. Try again in a moment.' };
  }
  const page = { bounds: frame.bounds, elements: frame.elements ?? [] };
  const marks = mine.map((group, i): PlannedMark => {
    const mark = classifyMark(group.strokes);
    return {
      n: i + 1,
      shapeIds: group.strokes.map((s) => s.shapeId),
      bounds: group.bounds,
      t0: group.t0,
      t1: group.t1,
      gesture: mark.gesture,
      hit: hitTest(mark, group.bounds, page),
      wrote: mark.wrote,
      freehand: mark.freehand,
    };
  });
  return { ok: true, plan: { frameId: frame.id, marks } };
}

function nearestFrame(group: MarkGroup, frames: FrameInfo[]): FrameInfo | undefined {
  let best: FrameInfo | undefined;
  let bestGap = FRAME_REACH_PX;
  for (const frame of frames) {
    const gap = rectGap(group.bounds, frame.bounds);
    if (gap <= bestGap) {
      best = frame;
      bestGap = gap;
    }
  }
  return best;
}

/** Pending shapes too far from every page to be edit marks: a new sketch, which voice can build. */
export function looseShapeIds(strokes: Stroke[], frames: FrameInfo[]): string[] {
  return groupStrokes(strokes)
    .filter((g) => !nearestFrame(g, frames))
    .flatMap((g) => g.strokes.map((s) => s.shapeId));
}

/** The page owning the most marks; on a tie, the one with the most recent mark. */
function busiestFrame(owners: Array<FrameInfo | undefined>): FrameInfo | undefined {
  const counts = new Map<FrameInfo, number>();
  for (const f of owners) if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  let best: FrameInfo | undefined;
  for (let i = owners.length - 1; i >= 0; i--) {
    const f = owners[i];
    if (f && (!best || counts.get(f)! > counts.get(best)!)) best = f;
  }
  return best;
}

/** The shapes this plan consumes; strokes drawn after planning are not included. */
export function planShapeIds(plan: EditPlan): string[] {
  return plan.marks.flatMap((m) => m.shapeIds);
}

/** A picture of the ink helps when the geometry alone is ambiguous. */
export function needsInk(mark: PlannedMark): boolean {
  return mark.hit.unsure || (mark.gesture === 'sketch' && mark.freehand);
}

export function toSegment(mark: PlannedMark, inkPng?: string): Segment {
  return {
    n: mark.n,
    gesture: mark.gesture,
    target: mark.hit.target,
    ...(mark.hit.pointsTo ? { pointsTo: mark.hit.pointsTo } : {}),
    unsure: mark.hit.unsure,
    wrote: mark.wrote,
    ...(inkPng ? { inkPng } : {}),
  };
}

export const circled = (n: number): string => (n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : `(${n})`);

const fileName = (src: string) => parseSrc(src)?.path.split('/').pop();

export function statusLine(plan: EditPlan): string {
  if (plan.marks.length === 0) return 'Editing the whole page…';
  const targets = plan.marks.flatMap((m) => (m.hit.pointsTo ? [m.hit.target, m.hit.pointsTo] : [m.hit.target]));
  const files = [...new Set(targets.flatMap(targetElements).flatMap((e) => fileName(e.src) ?? []))];
  return `Understood ${plan.marks.map((m) => circled(m.n)).join('')} → editing ${files.length > 0 ? files.join(', ') : 'the page'}…`;
}
