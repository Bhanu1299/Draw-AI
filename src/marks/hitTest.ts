import type { PreviewElement } from '@/preview/previewMessages';
import {
  boundsOf,
  containsPoint,
  fractionInPolygon,
  horizontalOverlap,
  overlapArea,
  rectArea,
  rectBottom,
  rectCenter,
  rectRight,
  type Point,
  type Rect,
} from '@/shared/geometry';
import type { MarkTarget, RegionDescription, TargetElement } from '@/shared/types';
import type { ClassifiedMark } from './classify';

export const CIRCLE_INSIDE = 0.7;
export const LOW_CONFIDENCE = 0.4;
export const MIN_TARGET_PX = 12;
const MAX_COVERS = 8;
const UNDERLINE_REACH_PX = 30;
const ARROW_HEAD_BOX_PX = 40;
const TIE_PX = 4;

export interface HitPage {
  bounds: Rect;
  /** Page coordinates. */
  elements: PreviewElement[];
}

export interface HitResult {
  target: MarkTarget;
  pointsTo?: MarkTarget;
  unsure: boolean;
  /** Page rects to outline on the canvas. */
  highlights: Rect[];
}

/** Resolve a classified mark to the page elements (or new region) it means (spec §5.2). */
export function hitTest(mark: ClassifiedMark, bounds: Rect, page: HitPage): HitResult {
  switch (mark.gesture) {
    case 'circle': {
      const hit = circled(page, mark.loop ?? outline(bounds));
      return mark.arrow ? withPointsTo(hit, pointedAt(page, mark.arrow.head)) : hit;
    }
    case 'arrow':
      return mark.arrow ? arrowHit(page, mark.arrow.tail, mark.arrow.head) : regionHit(page, bounds, true);
    case 'cross-out':
      return crossedOut(page, bounds);
    case 'underline':
      return underlined(page, bounds);
    case 'sketch':
      return regionHit(page, bounds, false);
  }
}

type Els = PreviewElement[];
const indexes = (els: Els) => els.map((_, i) => i);
const toTarget = (e: PreviewElement): TargetElement => ({ src: e.src, tag: e.tag, text: e.text });
const bySmallest = (els: Els) => (a: number, b: number) => rectArea(els[a].rect) - rectArea(els[b].rect);

function isAncestor(els: Els, ancestor: number, i: number): boolean {
  for (let p = els[i].parent; p >= 0; p = els[p].parent) if (p === ancestor) return true;
  return false;
}

function depth(els: Els, i: number): number {
  let d = 0;
  for (let p = els[i].parent; p >= 0; p = els[p].parent) d++;
  return d;
}

const related = (els: Els, a: number, b: number) => a === b || isAncestor(els, a, b) || isAncestor(els, b, a);

/** Drop any candidate whose ancestor is also a candidate. */
function outermost(els: Els, idx: number[]): number[] {
  return idx.filter((i) => !idx.some((j) => j !== i && isAncestor(els, j, i)));
}

function smallestAt(els: Els, p: Point): number | null {
  const hits = indexes(els).filter(
    (i) => els[i].rect.w >= MIN_TARGET_PX && els[i].rect.h >= MIN_TARGET_PX && containsPoint(els[i].rect, p),
  );
  return hits.sort(bySmallest(els))[0] ?? null;
}

function outline(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: rectRight(r), y: r.y },
    { x: rectRight(r), y: rectBottom(r) },
    { x: r.x, y: rectBottom(r) },
  ];
}

function elementsHit(els: Els, idx: number[], unsure = false): HitResult {
  return { target: { kind: 'elements', elements: idx.map((i) => toTarget(els[i])) }, unsure, highlights: idx.map((i) => els[i].rect) };
}

function regionHit(page: HitPage, r: Rect, unsure: boolean): HitResult {
  return { target: { kind: 'region', region: describeRegion(page, r) }, unsure, highlights: [r] };
}

function withPointsTo(hit: HitResult, to: HitResult): HitResult {
  return { target: hit.target, pointsTo: to.target, unsure: hit.unsure || to.unsure, highlights: [...hit.highlights, ...to.highlights] };
}

function circled(page: HitPage, loop: Point[]): HitResult {
  const els = page.elements;
  const fractions = els.map((e) => fractionInPolygon(e.rect, loop));
  const inside = outermost(els, indexes(els).filter((i) => rectArea(els[i].rect) > 0 && fractions[i] >= CIRCLE_INSIDE));
  if (inside.length > 0) return elementsHit(els, inside);
  // Nothing fully circled: the element the loop covers best, smallest on ties.
  const best = indexes(els)
    .filter((i) => fractions[i] > 0)
    .sort((a, b) => fractions[b] - fractions[a] || rectArea(els[a].rect) - rectArea(els[b].rect))[0];
  if (best !== undefined && fractions[best] >= LOW_CONFIDENCE) return elementsHit(els, [best]);
  return regionHit(page, boundsOf(loop), true);
}

function pointedAt(page: HitPage, head: Point): HitResult {
  const i = smallestAt(page.elements, head);
  if (i !== null) return elementsHit(page.elements, [i]);
  const half = ARROW_HEAD_BOX_PX / 2;
  return regionHit(page, { x: head.x - half, y: head.y - half, w: ARROW_HEAD_BOX_PX, h: ARROW_HEAD_BOX_PX }, true);
}

function arrowHit(page: HitPage, tail: Point, head: Point): HitResult {
  const els = page.elements;
  const from = smallestAt(els, tail);
  const to = smallestAt(els, head);
  // Tail on one element and head on an unrelated one: "move this there".
  if (from !== null && to !== null && !related(els, from, to)) {
    return withPointsTo(elementsHit(els, [from]), elementsHit(els, [to]));
  }
  return pointedAt(page, head);
}

function crossedOut(page: HitPage, box: Rect): HitResult {
  const els = page.elements;
  const covered = outermost(
    els,
    indexes(els).filter((i) => rectArea(els[i].rect) > 0 && overlapArea(els[i].rect, box) >= CIRCLE_INSIDE * rectArea(els[i].rect)),
  );
  if (covered.length > 0) return elementsHit(els, covered);
  const holder = indexes(els)
    .filter((i) => rectArea(box) > 0 && overlapArea(els[i].rect, box) >= 0.6 * rectArea(box))
    .sort(bySmallest(els))[0];
  if (holder !== undefined) return elementsHit(els, [holder]);
  const atCenter = smallestAt(els, rectCenter(box));
  return atCenter !== null ? elementsHit(els, [atCenter], true) : regionHit(page, box, true);
}

function underlined(page: HitPage, box: Rect): HitResult {
  const els = page.elements;
  const above = indexes(els)
    .filter((i) => {
      const r = els[i].rect;
      return (
        r.h <= 200 &&
        rectBottom(r) >= box.y - UNDERLINE_REACH_PX &&
        rectBottom(r) <= rectBottom(box) + 6 &&
        horizontalOverlap(r, box) >= 0.5 * Math.min(r.w, box.w)
      );
    })
    .sort(bySmallest(els));
  const pick = above.find((i) => els[i].text !== '') ?? above[0];
  if (pick !== undefined) return elementsHit(els, [pick]);
  return { ...crossedOut(page, box), unsure: true };
}

/** Among near-ties at the edge closest to the region, the outermost element. */
function nearest(els: Els, idx: number[], edge: (i: number) => number, want: 'max' | 'min'): number | undefined {
  if (idx.length === 0) return undefined;
  const values = idx.map(edge);
  const best = want === 'max' ? Math.max(...values) : Math.min(...values);
  return idx.filter((i) => Math.abs(edge(i) - best) <= TIE_PX).sort((a, b) => depth(els, a) - depth(els, b))[0];
}

function describeRegion(page: HitPage, r: Rect): RegionDescription {
  const els = page.elements;
  const p = page.bounds;
  // Page-sized wrappers (<main>, the root div) say nothing about where the region is.
  const usable = indexes(els).filter((i) => rectArea(els[i].rect) > 0 && els[i].rect.h < 0.9 * p.h);
  const covered = outermost(els, usable.filter((i) => overlapArea(els[i].rect, r) >= CIRCLE_INSIDE * rectArea(els[i].rect)));
  const free = usable.filter((i) => !covered.some((c) => c === i || isAncestor(els, c, i)));
  const inside = free
    .filter((i) => rectArea(r) > 0 && overlapArea(els[i].rect, r) >= 0.9 * rectArea(r))
    .sort(bySmallest(els))[0];
  const beside = free.filter((i) => horizontalOverlap(els[i].rect, r) >= 0.5 * Math.min(els[i].rect.w, r.w));
  const above = nearest(
    els,
    beside.filter((i) => els[i].rect.y < r.y && rectBottom(els[i].rect) < rectBottom(r)),
    (i) => rectBottom(els[i].rect),
    'max',
  );
  const below = nearest(
    els,
    beside.filter((i) => els[i].rect.y > r.y && rectBottom(els[i].rect) > rectBottom(r)),
    (i) => els[i].rect.y,
    'min',
  );
  const outside =
    rectRight(r) <= p.x ? 'left' : r.x >= rectRight(p) ? 'right' : rectBottom(r) <= p.y ? 'above' : r.y >= rectBottom(p) ? 'below' : null;
  return {
    width: Math.round(r.w),
    height: Math.round(r.h),
    left: Math.round(r.x - p.x),
    top: Math.round(r.y - p.y),
    fullWidth: r.w >= 0.8 * p.w,
    outside,
    inside: inside !== undefined ? toTarget(els[inside]) : null,
    elementAbove: above !== undefined ? toTarget(els[above]) : null,
    elementBelow: below !== undefined ? toTarget(els[below]) : null,
    covers: covered.slice(0, MAX_COVERS).map((i) => toTarget(els[i])),
  };
}
