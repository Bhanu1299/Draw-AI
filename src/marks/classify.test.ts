import { describe, expect, it } from 'vitest';
import { classifyMark, classifyStroke, countReversals } from './classify';
import { arrowHead, arrowStroke, line, loopAround, rectOf, rectOutline, stroke, zigzag } from './testing';

describe('countReversals', () => {
  it('counts direction changes bigger than the threshold', () => {
    expect(countReversals([0, 10, 20, 10, 0, 10, 20], 8)).toBe(2);
    expect(countReversals([0, 20, 0, 20, 0], 8)).toBe(3);
    expect(countReversals([0, 3, 0, 3, 0], 8)).toBe(0);
  });
});

describe('classifyStroke', () => {
  it('reads a closed loop as a circle', () => {
    expect(classifyStroke(loopAround(rectOf(3))).shape).toBe('circle');
  });
  it('reads a one-stroke arrow with its tail and head', () => {
    const reading = classifyStroke(arrowStroke({ x: 200, y: 480 }, { x: 600, y: 374 }));
    expect(reading.shape).toBe('arrow');
    expect(reading.head).toEqual({ x: 600, y: 374 });
    expect(reading.tail).toEqual({ x: 200, y: 480 });
  });
  it('reads a zigzag as a cross-out, not a circle', () => {
    expect(classifyStroke(zigzag({ x: 490, y: 720, w: 300, h: 260 })).shape).toBe('cross-out');
  });
  it('reads a flat line as an underline and a diagonal as straight', () => {
    expect(classifyStroke(line({ x: 360, y: 278 }, { x: 920, y: 278 })).shape).toBe('underline');
    expect(classifyStroke(line({ x: 0, y: 0 }, { x: 200, y: 200 })).shape).toBe('straight');
  });
  it('treats tiny strokes as scribbles', () => {
    expect(classifyStroke([{ x: 0, y: 0 }, { x: 3, y: 3 }]).shape).toBe('scribble');
  });
});

describe('classifyMark', () => {
  it('uses tool shapes as they are', () => {
    expect(classifyMark([stroke('ellipse', loopAround(rectOf(3)))]).gesture).toBe('circle');
    const toolArrow = classifyMark([stroke('arrow', [{ x: 1110, y: 36 }, { x: 640, y: 1200 }])]);
    expect(toolArrow).toMatchObject({ gesture: 'arrow', arrow: { tail: { x: 1110, y: 36 }, head: { x: 640, y: 1200 } } });
  });
  it('joins two crossing lines into a cross-out', () => {
    const r = { x: 880, y: 720, w: 300, h: 260 };
    const x = classifyMark([
      stroke('draw', line({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h })),
      stroke('draw', line({ x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h })),
    ]);
    expect(x.gesture).toBe('cross-out');
  });
  it('joins a shaft and a separate head into an arrow', () => {
    const tail = { x: 200, y: 480 };
    const head = { x: 600, y: 374 };
    const mark = classifyMark([stroke('draw', line(tail, head)), stroke('draw', arrowHead(tail, head))]);
    expect(mark.gesture).toBe('arrow');
    expect(mark.arrow?.head).toEqual(head);
  });
  it('keeps the arrow of a circle-plus-arrow mark', () => {
    const mark = classifyMark([
      stroke('draw', loopAround(rectOf(12))),
      stroke('arrow', [{ x: 420, y: 850 }, { x: 1250, y: 850 }]),
    ]);
    expect(mark.gesture).toBe('circle');
    expect(mark.arrow?.head).toEqual({ x: 1250, y: 850 });
  });
  it('treats boxes and lines as a sketch and collects written words', () => {
    const mark = classifyMark([
      stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 })),
      stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 0, 'Testimonials'),
    ]);
    expect(mark).toMatchObject({ gesture: 'sketch', wrote: ['Testimonials'], freehand: false });
  });
  it('lets a written note ride along with a circle', () => {
    const mark = classifyMark([stroke('draw', loopAround(rectOf(3))), stroke('text', rectOutline(rectOf(2)), 0, 'bigger')]);
    expect(mark).toMatchObject({ gesture: 'circle', wrote: ['bigger'], freehand: true });
  });
  it('falls back to a sketch for unreadable pen strokes', () => {
    const scribble = [{ x: 0, y: 0 }, { x: 40, y: 90 }, { x: 80, y: 10 }, { x: 10, y: 60 }, { x: 95, y: 70 }];
    expect(classifyMark([stroke('draw', scribble)]).gesture).toBe('sketch');
  });
});
