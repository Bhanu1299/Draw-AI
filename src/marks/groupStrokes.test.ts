import { describe, expect, it } from 'vitest';
import { groupStrokes } from './groupStrokes';
import { line, stroke } from './testing';

describe('groupStrokes', () => {
  it('joins strokes drawn close together in quick succession', () => {
    const a = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const b = stroke('draw', line({ x: 110, y: 10 }, { x: 150, y: 10 }), 700);
    const groups = groupStrokes([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].bounds).toEqual({ x: 0, y: 0, w: 150, h: 10 });
    expect(groups[0].t1).toBe(1100);
  });
  it('splits on a long pause or a big distance', () => {
    const a = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const late = stroke('draw', line({ x: 110, y: 0 }, { x: 150, y: 0 }), 2000);
    const far = stroke('draw', line({ x: 600, y: 0 }, { x: 700, y: 0 }), 500);
    expect(groupStrokes([a, late])).toHaveLength(2);
    expect(groupStrokes([a, far])).toHaveLength(2);
  });
  it('orders marks by time whatever the input order', () => {
    const first = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const second = stroke('draw', line({ x: 900, y: 0 }, { x: 1000, y: 0 }), 5000);
    expect(groupStrokes([second, first]).map((g) => g.t0)).toEqual([0, 5000]);
  });
});
