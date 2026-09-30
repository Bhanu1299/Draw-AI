import { describe, expect, it } from 'vitest';
import { boundsOf, type Point, type Rect } from '@/shared/geometry';
import type { MarkTarget } from '@/shared/types';
import type { ClassifiedMark } from './classify';
import { hitTest } from './hitTest';
import { loopAround, PAGE_BOUNDS, PAGE_ELEMENTS, rectOf, src } from './testing';

const page = { bounds: PAGE_BOUNDS, elements: PAGE_ELEMENTS };
const srcs = (t: MarkTarget | undefined) => (t?.kind === 'elements' ? t.elements.map((e) => e.src) : t?.kind);
const mark = (gesture: ClassifiedMark['gesture'], extra: Partial<ClassifiedMark> = {}): ClassifiedMark => ({
  gesture, wrote: [], freehand: true, ...extra,
});
const circle = (r: Rect) => {
  const loop = loopAround(r);
  return hitTest(mark('circle', { loop }), boundsOf(loop), page);
};
const arrow = (tail: Point, head: Point) => hitTest(mark('arrow', { arrow: { tail, head } }), boundsOf([tail, head]), page);

describe('hitTest: circle', () => {
  it('keeps only the outermost fully circled element', () => {
    expect(srcs(circle(rectOf(3)).target)).toEqual([src(3)]);
  });
  it('returns several siblings when only they are circled', () => {
    expect(srcs(circle({ x: 900, y: 24, w: 160, h: 24 }).target)).toEqual([src(4), src(5)]);
  });
  it('turns a loop around empty space into an unsure region', () => {
    const hit = circle({ x: 60, y: 440, w: 100, h: 60 });
    expect(hit.unsure).toBe(true);
    expect(hit.target.kind === 'region' && hit.target.region.inside?.src).toBe(src(7));
  });
  it('highlights what it hit', () => {
    expect(circle(rectOf(3)).highlights).toEqual([rectOf(3)]);
  });
});

describe('hitTest: arrow', () => {
  it('targets the smallest element under the head', () => {
    const hit = arrow({ x: 100, y: 400 }, { x: 600, y: 374 });
    expect(srcs(hit.target)).toEqual([src(10)]);
    expect(hit.pointsTo).toBeUndefined();
  });
  it('reads tail-on-A, head-on-B as "move A to B"', () => {
    const hit = arrow({ x: 1110, y: 36 }, { x: 640, y: 1200 });
    expect(srcs(hit.target)).toEqual([src(6)]);
    expect(srcs(hit.pointsTo)).toEqual([src(15)]);
  });
  it('is unsure when the head lands on nothing', () => {
    const hit = arrow({ x: 1000, y: 300 }, { x: 1500, y: 300 });
    expect(hit.unsure).toBe(true);
    expect(hit.target.kind === 'region' && hit.target.region.outside).toBe('right');
  });
});

describe('hitTest: circle with an arrow', () => {
  it('targets the circled element and points where the arrow ends', () => {
    const loop = loopAround(rectOf(12));
    const hit = hitTest(mark('circle', { loop, arrow: { tail: { x: 420, y: 850 }, head: { x: 1030, y: 850 } } }), boundsOf(loop), page);
    expect(srcs(hit.target)).toEqual([src(12)]);
    expect(srcs(hit.pointsTo)).toEqual([src(14)]);
  });
});

describe('hitTest: cross-out and underline', () => {
  it('crosses out the element the scribble covers', () => {
    const hit = hitTest(mark('cross-out'), { x: 490, y: 720, w: 300, h: 260 }, page);
    expect(srcs(hit.target)).toEqual([src(13)]);
  });
  it('underlines the text element just above the line', () => {
    const hit = hitTest(mark('underline'), { x: 360, y: 278, w: 560, h: 0 }, page);
    expect(srcs(hit.target)).toEqual([src(8)]);
  });
});

describe('hitTest: sketch regions', () => {
  it('places a region straddling two sections between them', () => {
    const hit = hitTest(mark('sketch'), { x: 40, y: 560, w: 1200, h: 100 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region).toMatchObject({ width: 1200, height: 100, left: 40, top: 560, fullWidth: true, outside: null, inside: null });
    expect(region?.elementAbove?.src).toBe(src(7));
    expect(region?.elementBelow?.src).toBe(src(11));
  });
  it('places a region inside a section, under the header', () => {
    const hit = hitTest(mark('sketch'), { x: 1000, y: 150, w: 200, h: 150 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region?.inside?.src).toBe(src(7));
    expect(region?.elementAbove?.src).toBe(src(1));
  });
  it('places a region below the page after the footer', () => {
    const hit = hitTest(mark('sketch'), { x: 100, y: 1450, w: 1000, h: 200 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region?.outside).toBe('below');
    expect(region?.elementAbove?.src).toBe(src(15));
  });
  it('lists elements a region mostly covers', () => {
    const hit = hitTest(mark('sketch'), { x: 850, y: 690, w: 370, h: 320 }, page);
    expect(hit.target.kind === 'region' && hit.target.region.covers.map((e) => e.src)).toEqual([src(14)]);
  });
});
