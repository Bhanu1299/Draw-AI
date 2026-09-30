import { describe, expect, it } from 'vitest';
import { circled, looseShapeIds, needsInk, planEdit, planShapeIds, statusLine, toSegment } from './planEdit';
import { line, loopAround, PAGE, PAGE_BOUNDS, rectOf, rectOutline, src, stroke, zigzag } from './testing';
import type { FrameInfo } from './types';

const other: FrameInfo = { id: 'shape:other', bounds: { x: 3000, y: 0, w: 1280, h: 800 }, elements: [] };

describe('planEdit', () => {
  it('numbers marks on the nearest page in time order', () => {
    const nav = stroke('draw', loopAround(rectOf(3)), 0);
    const card = stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 3000);
    const result = planEdit([card, nav], [PAGE, other], null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.frameId).toBe(PAGE.id);
    expect(result.plan.marks.map((m) => [m.n, m.gesture])).toEqual([[1, 'circle'], [2, 'cross-out']]);
    expect(planShapeIds(result.plan)).toEqual([nav.shapeId, card.shapeId]);
  });
  it('targets the page with the most marks and leaves the others pending', () => {
    const a = stroke('draw', loopAround(rectOf(3)), 0);
    const b = stroke('draw', loopAround({ x: 3100, y: 100, w: 100, h: 40 }), 3000);
    const c = stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 6000);
    const result = planEdit([a, b, c], [PAGE, other], null);
    expect(result.ok && result.plan.marks.flatMap((m) => m.shapeIds)).toEqual([a.shapeId, c.shapeId]);
  });
  it('ignores marks far from every page', () => {
    const far = stroke('draw', loopAround({ x: 9000, y: 9000, w: 100, h: 50 }));
    expect(planEdit([far], [PAGE], null)).toMatchObject({ ok: false, reason: 'no-frame' });
  });
  it('waits for the element map instead of guessing', () => {
    const loading = { ...PAGE, elements: null };
    expect(planEdit([stroke('draw', loopAround(rectOf(3)))], [loading], null)).toMatchObject({ ok: false, reason: 'loading' });
  });
  it('allows a whole-page instruction on a selected page with no marks', () => {
    expect(planEdit([], [PAGE], PAGE.id)).toEqual({ ok: true, plan: { frameId: PAGE.id, marks: [] } });
    expect(planEdit([], [PAGE, other], null)).toMatchObject({ ok: false, reason: 'no-marks' });
  });
  it("carries each mark's drawing time, for binding words to it", () => {
    const result = planEdit([stroke('draw', loopAround(rectOf(3)), 1000)], [PAGE], null);
    expect(result.ok && result.plan.marks[0]).toMatchObject({ n: 1, t0: 1000, t1: 1400 });
  });
  it('uses the only page for a whole-page instruction when nothing is drawn', () => {
    expect(planEdit([], [PAGE], null)).toEqual({ ok: true, plan: { frameId: PAGE.id, marks: [] } });
  });
  it('finds pending shapes too far from any page to be marks (a new sketch)', () => {
    const far = stroke('rectangle', rectOutline({ x: 5000, y: 5000, w: 200, h: 100 }));
    const near = stroke('draw', loopAround(rectOf(3)));
    expect(looseShapeIds([far, near], [PAGE])).toEqual([far.shapeId]);
    expect(looseShapeIds([far], [])).toEqual([far.shapeId]);
  });
});

describe('segments and status', () => {
  const result = planEdit(
    [stroke('draw', loopAround(rectOf(3)), 0), stroke('rectangle', line({ x: 40, y: 560 }, { x: 1240, y: 660 }), 3000)],
    [{ ...PAGE, bounds: PAGE_BOUNDS }],
    null,
  );
  if (!result.ok) throw new Error('plan failed');
  const [nav, sketch] = result.plan.marks;

  it('builds a segment from a mark', () => {
    expect(toSegment(nav)).toEqual({
      n: 1, gesture: 'circle', target: { kind: 'elements', elements: [{ src: src(3), tag: 'nav', text: 'Product Pricing Blog' }] },
      unsure: false, wrote: [],
    });
    expect(toSegment(nav, 'PNG').inkPng).toBe('PNG');
  });
  it('asks for ink only for unsure marks and freehand sketches', () => {
    expect(needsInk(nav)).toBe(false);
    expect(needsInk(sketch)).toBe(false);
    expect(needsInk({ ...sketch, freehand: true })).toBe(true);
    expect(needsInk({ ...nav, hit: { ...nav.hit, unsure: true } })).toBe(true);
  });
  it('summarises what is being edited', () => {
    expect(circled(1)).toBe('①');
    expect(statusLine(result.plan)).toBe('Understood ①② → editing Header.tsx, Hero.tsx, Features.tsx…');
    expect(statusLine({ frameId: PAGE.id, marks: [] })).toBe('Editing the whole page…');
  });
});

describe('planEdit performance', () => {
  it('plans 5 loops over a 3000-element page fast enough to run while drawing', () => {
    const elements = Array.from({ length: 3000 }, (_, i) => ({
      src: `components/Grid.tsx:${i + 1}:1`, tag: 'div', text: '',
      rect: { x: (i % 60) * 21, y: Math.floor(i / 60) * 28, w: 20, h: 26 }, parent: -1,
    }));
    const page: FrameInfo = { id: 'shape:big', bounds: { x: 0, y: 0, w: 1280, h: 1400 }, elements };
    const loops = [0, 1, 2, 3, 4].map((k) => stroke('draw', loopAround({ x: 100 + k * 220, y: 300, w: 120, h: 80 }, 200), k * 5000));
    planEdit(loops, [page], null); // warm up
    const started = performance.now();
    const result = planEdit(loops, [page], null);
    const ms = performance.now() - started;
    expect(result.ok && result.plan.marks).toHaveLength(5);
    expect(ms).toBeLessThan(40);
  });
});
