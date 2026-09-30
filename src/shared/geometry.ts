/** Plane geometry in page coordinates, shared by the preview, the mark pipeline and tests. */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectRight = (r: Rect): number => r.x + r.w;
export const rectBottom = (r: Rect): number => r.y + r.h;
export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function horizontalOverlap(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x));
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r);
}

/** Distance between two rects; 0 when they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - rectRight(b), b.x - rectRight(a));
  const dy = Math.max(0, a.y - rectBottom(b), b.y - rectBottom(a));
  return Math.hypot(dx, dy);
}

export function unionRects(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map(rectRight)) - x, h: Math.max(...rects.map(rectBottom)) - y };
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pathLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distance(points[i - 1], points[i]);
  return sum;
}

/** Ray casting; the polygon is closed implicitly. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const SAMPLES = 6;

/** Share of a rect's area inside a closed polygon, sampled on a 6×6 grid. */
export function fractionInPolygon(r: Rect, poly: Point[]): number {
  if (poly.length < 3 || rectArea(r) === 0) return 0;
  let hits = 0;
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const p = { x: r.x + ((i + 0.5) / SAMPLES) * r.w, y: r.y + ((j + 0.5) / SAMPLES) * r.h };
      if (pointInPolygon(p, poly)) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

/** True when segment a1–a2 properly crosses segment b1–b2. */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a1, a2, b1) * side(a1, a2, b2) < 0 && side(b1, b2, a1) * side(b1, b2, a2) < 0;
}
