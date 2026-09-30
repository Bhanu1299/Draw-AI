import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  containsPoint,
  fractionInPolygon,
  horizontalOverlap,
  overlapArea,
  pathLength,
  pointInPolygon,
  rectGap,
  segmentsCross,
  unionRects,
} from './geometry';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('geometry', () => {
  it('measures overlap between rects', () => {
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(horizontalOverlap({ x: 0, y: 0, w: 10, h: 1 }, { x: 4, y: 50, w: 10, h: 1 })).toBe(6);
  });
  it('measures the gap between rects, zero when touching', () => {
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 5, h: 5 })).toBe(5);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(0);
  });
  it('builds bounds from points and rects', () => {
    expect(boundsOf([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual({ x: -1, y: 2, w: 4, h: 7 });
    expect(unionRects([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });
  it('tests points against rects and polygons', () => {
    expect(containsPoint({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });
  it('samples how much of a rect lies inside a polygon', () => {
    expect(fractionInPolygon({ x: 10, y: 10, w: 20, h: 20 }, square)).toBe(1);
    expect(fractionInPolygon({ x: 50, y: 0, w: 100, h: 100 }, square)).toBe(0.5);
    expect(fractionInPolygon({ x: 0, y: 0, w: 0, h: 10 }, square)).toBe(0);
  });
  it('measures path length and segment crossings', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
});
