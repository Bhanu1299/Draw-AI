import { describe, expect, it } from 'vitest';
import { toPageElements } from './pageElements';

describe('toPageElements', () => {
  it('moves frame-local rects to wherever the frame now sits', () => {
    const local = [{ src: 'App.tsx:6:5', tag: 'h1', text: 'Hi', rect: { x: 40, y: 80, w: 300, h: 60 }, parent: -1 }];
    const moved = toPageElements(local, (p) => ({ x: p.x + 2000, y: p.y + 500 }));
    expect(moved[0].rect).toEqual({ x: 2040, y: 580, w: 300, h: 60 });
    expect(local[0].rect.x).toBe(40);
  });
});
