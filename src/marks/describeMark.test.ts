import { describe, expect, it } from 'vitest';
import { describeMark } from './describeMark';
import { planEdit } from './planEdit';
import { loopAround, PAGE, rectOf, rectOutline, stroke } from './testing';

function marks(...strokes: Parameters<typeof planEdit>[0]) {
  const result = planEdit(strokes, [PAGE], null);
  if (!result.ok) throw new Error(result.message);
  return result.plan.marks;
}

describe('describeMark', () => {
  it('names the element, its text and its source line', () => {
    expect(describeMark(marks(stroke('draw', loopAround(rectOf(3))))[0])).toBe('Circled <nav> “Product Pricing Blog” · Header.tsx:5');
  });
  it('counts extra elements', () => {
    expect(describeMark(marks(stroke('draw', loopAround({ x: 900, y: 24, w: 160, h: 24 })))[0])).toBe(
      'Circled <a> “Product” · Header.tsx:6 +1 more',
    );
  });
  it('describes a sketched region by its neighbours and written words', () => {
    const [mark] = marks(
      stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 }), 0),
      stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 100, 'Testimonials'),
    );
    expect(describeMark(mark)).toBe('Sketched new UI below <section> “Testimonials”');
  });
});
