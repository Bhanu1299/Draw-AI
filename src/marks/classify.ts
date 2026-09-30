import { boundsOf, distance, pathLength, rectCenter, segmentsCross, type Point } from '@/shared/geometry';
import type { Gesture } from '@/shared/types';
import type { Stroke, StrokeKind } from './types';

export type StrokeShape = 'circle' | 'arrow' | 'cross-out' | 'underline' | 'straight' | 'scribble';

export interface StrokeReading {
  shape: StrokeShape;
  tail?: Point;
  head?: Point;
}

export interface ClassifiedMark {
  gesture: Gesture;
  /** Enclosing outline, for circles. */
  loop?: Point[];
  /** Tail and head, for arrows (also kept when a circle comes with an arrow). */
  arrow?: { tail: Point; head: Point };
  wrote: string[];
  /** Contains pen strokes, so a picture of the ink says more than the shapes do. */
  freehand: boolean;
}

const MIN_STROKE_PX = 20;
const MIN_ARROW_PX = 40;
const REVERSAL_PX = 8;
/** Tool shapes that always mean "new UI here". */
const SKETCH_KINDS: ReadonlySet<StrokeKind> = new Set(['rectangle', 'line', 'other']);

/** Direction changes along one axis, ignoring wobble smaller than `threshold`. */
export function countReversals(values: number[], threshold: number): number {
  let dir = 0;
  let extreme = values[0] ?? 0;
  let reversals = 0;
  for (const v of values) {
    if (dir === 0) {
      if (Math.abs(v - extreme) >= threshold) {
        dir = Math.sign(v - extreme);
        extreme = v;
      }
    } else if ((v - extreme) * dir > 0) {
      extreme = v;
    } else if (Math.abs(v - extreme) >= threshold) {
      reversals++;
      dir = -dir;
      extreme = v;
    }
  }
  return reversals;
}

/** Classify one freehand pen stroke by its geometry (spec §5.1). */
export function classifyStroke(points: Point[]): StrokeReading {
  const length = pathLength(points);
  if (points.length < 2 || length < MIN_STROKE_PX) return { shape: 'scribble' };
  const start = points[0];
  const end = points[points.length - 1];
  const box = boundsOf(points);
  const xTurns = countReversals(points.map((p) => p.x), REVERSAL_PX);
  const yTurns = countReversals(points.map((p) => p.y), REVERSAL_PX);
  // A loop ends near its start and turns back on both axes (a zigzag only turns on one).
  if (distance(start, end) < 0.25 * length && box.w >= 16 && box.h >= 16 && xTurns >= 1 && yTurns >= 1) {
    return { shape: 'circle' };
  }
  const arrow = readOneStrokeArrow(points);
  if (arrow) return { shape: 'arrow', ...arrow };
  if (Math.max(xTurns, yTurns) >= 3) return { shape: 'cross-out' };
  const straightness = length / Math.max(1, distance(start, end));
  if (straightness <= 1.3 && box.h <= 0.15 * box.w) return { shape: 'underline' };
  if (straightness <= 1.15) return { shape: 'straight' };
  return { shape: 'scribble' };
}

/** A straight shaft to the farthest point, then a short head drawn around that tip. */
function readOneStrokeArrow(points: Point[]): { tail: Point; head: Point } | null {
  const start = points[0];
  let tipIndex = 0;
  points.forEach((p, i) => {
    if (distance(start, p) > distance(start, points[tipIndex])) tipIndex = i;
  });
  const tip = points[tipIndex];
  const chord = distance(start, tip);
  if (chord < MIN_ARROW_PX || tipIndex === points.length - 1) return null;
  if (pathLength(points.slice(0, tipIndex + 1)) / chord > 1.2) return null;
  const head = points.slice(tipIndex);
  const headLength = pathLength(head);
  if (headLength < 0.1 * chord || headLength > 1.2 * chord) return null;
  if (head.some((p) => distance(p, tip) > 0.4 * chord)) return null;
  return { tail: start, head: tip };
}

type Reading = StrokeReading & { stroke: Stroke; text?: true };

function readStroke(stroke: Stroke): Reading {
  const { points } = stroke;
  switch (stroke.kind) {
    case 'ellipse':
      return { stroke, shape: 'circle' };
    case 'arrow':
      return { stroke, shape: 'arrow', tail: points[0], head: points[points.length - 1] };
    case 'text':
    case 'note':
      return { stroke, shape: 'scribble', text: true };
    default:
      return { stroke, ...classifyStroke(points) };
  }
}

const isLine = (r: Reading) => !r.text && (r.shape === 'straight' || r.shape === 'underline');
const ends = (r: Reading): [Point, Point] => [r.stroke.points[0], r.stroke.points[r.stroke.points.length - 1]];
const chordOf = (r: Reading) => distance(...ends(r));

function angleBetween(a: Reading, b: Reading): number {
  const angle = (r: Reading) => {
    const [p, q] = ends(r);
    return ((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 180) % 180;
  };
  const diff = Math.abs(angle(a) - angle(b));
  return Math.min(diff, 180 - diff);
}

/** Two similar lines crossing at a wide angle: an X. */
function combineCrossOut(readings: Reading[]): Reading[] {
  const lines = readings.filter(isLine);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const ratio = chordOf(a) / Math.max(1, chordOf(b));
      if (ratio < 0.5 || ratio > 2 || angleBetween(a, b) < 45 || !segmentsCross(...ends(a), ...ends(b))) continue;
      return [...readings.filter((r) => r !== a && r !== b), { stroke: a.stroke, shape: 'cross-out' }];
    }
  }
  return readings;
}

/** A long line with one or two short strokes at one end: an arrow pointing at that end. */
function combineArrow(readings: Reading[]): Reading[] {
  for (const shaft of readings.filter(isLine)) {
    const [start, end] = ends(shaft);
    const chord = distance(start, end);
    if (chord < MIN_ARROW_PX) continue;
    for (const tip of [end, start]) {
      const heads = readings.filter(
        (r) =>
          r !== shaft &&
          !r.text &&
          r.shape !== 'circle' &&
          pathLength(r.stroke.points) <= 0.6 * chord &&
          distance(rectCenter(r.stroke.bounds), tip) <= 0.3 * chord + 10,
      );
      if (heads.length === 0 || heads.length > 2) continue;
      const tail = tip === end ? start : end;
      return [...readings.filter((r) => r !== shaft && !heads.includes(r)), { stroke: shaft.stroke, shape: 'arrow', tail, head: tip }];
    }
  }
  return readings;
}

/** Classify a whole mark (one group of strokes) into one gesture. */
export function classifyMark(strokes: Stroke[]): ClassifiedMark {
  const base = {
    wrote: strokes.flatMap((s) => (s.text ? [s.text] : [])),
    freehand: strokes.some((s) => s.kind === 'draw'),
  };
  if (strokes.some((s) => SKETCH_KINDS.has(s.kind))) return { gesture: 'sketch', ...base };
  const readings = combineArrow(combineCrossOut(strokes.map(readStroke))).filter((r) => !r.text);
  const circle = readings.find((r) => r.shape === 'circle');
  const arrowReading = readings.find((r) => r.shape === 'arrow');
  const arrow = arrowReading?.tail && arrowReading.head ? { tail: arrowReading.tail, head: arrowReading.head } : undefined;
  if (circle) return { gesture: 'circle', loop: circle.stroke.points, ...(arrow ? { arrow } : {}), ...base };
  if (readings.some((r) => r.shape === 'cross-out')) return { gesture: 'cross-out', ...base };
  if (arrow) return { gesture: 'arrow', arrow, ...base };
  if (readings.length > 0 && readings.every(isLine) && readings.some((r) => r.shape === 'underline')) {
    return { gesture: 'underline', ...base };
  }
  return { gesture: 'sketch', ...base };
}
