import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest, Segment } from '@/shared/types';
import { compileEditPrompt, describeElement, EDIT_SYSTEM_PROMPT, editFixPrompt, MAX_WHOLE_PROJECT_CHARS } from './editPrompt';

const nav = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Product Pricing Blog' };
const hero = { src: 'components/Hero.tsx:5:5', tag: 'section', text: 'Sketch it.' };
const circleNav: Segment = { n: 1, gesture: 'circle', target: { kind: 'elements', elements: [nav] }, unsure: false, wrote: [] };
const req = (over: Partial<EditRequest>): EditRequest => ({ files: SAMPLE_FILES, segments: [], instruction: '', ...over });
const textOf = (r: ReturnType<typeof compileEditPrompt>) =>
  r.ok ? r.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n') : r.error;

describe('edit system prompt', () => {
  it('shares the code rules and forbids data-src', () => {
    expect(EDIT_SYSTEM_PROMPT).toContain('react, lucide-react');
    expect(EDIT_SYSTEM_PROMPT).toContain('Never write data-src attributes');
    expect(EDIT_SYSTEM_PROMPT).toContain('<edit path="PATH">');
  });
});

describe('compileEditPrompt', () => {
  it('describes an element with its source line', () => {
    expect(describeElement(nav, SAMPLE_FILES)).toBe(
      '<nav> "Product Pricing Blog" at components/Header.tsx:5 → <nav className="flex gap-8 text-sm text-slate-600">',
    );
  });
  it('shows App.tsx and the marked files, and only lists the rest', () => {
    const text = textOf(compileEditPrompt(req({ segments: [circleNav], instruction: '1 smaller' })));
    expect(text).toContain('1. CIRCLED:');
    expect(text).toContain('Instruction: 1 smaller');
    expect(text).toContain('--- App.tsx ---');
    expect(text).toContain('--- components/Header.tsx ---');
    expect(text).not.toContain('--- components/Hero.tsx ---');
    expect(text).toContain('Other files (not shown');
  });
  it('describes moves, regions, written words and unsure marks', () => {
    const sketch: Segment = {
      n: 2, gesture: 'sketch', unsure: true, wrote: ['Testimonials'], inkPng: 'PNG',
      target: { kind: 'region', region: { width: 1200, height: 300, left: 40, top: 560, fullWidth: true, outside: null, inside: null, elementAbove: hero, elementBelow: null, covers: [] } },
    };
    const move: Segment = { ...circleNav, n: 3, gesture: 'arrow', pointsTo: { kind: 'elements', elements: [hero] } };
    const result = compileEditPrompt(req({ segments: [sketch, move] }));
    const text = textOf(result);
    expect(text).toContain('2. SKETCHED new UI (unsure):');
    expect(text).toContain('region 1200×300px, full width, 40px from the left, 560px from the top of the page');
    expect(text).toContain('below <section> "Sketch it." at components/Hero.tsx:5');
    expect(text).toContain('wrote: "Testimonials"');
    expect(text).toContain('3. POINTED AT, FROM:');
    expect(text).toContain('   TO:');
    expect(text).toContain('Instruction: (none: follow the marks)');
    expect(result.ok && result.content.slice(0, 2)).toEqual([
      { type: 'text', text: 'Ink image for mark 2:' },
      { type: 'image', pngBase64: 'PNG' },
    ]);
  });
  it('shows every file for whole-page instructions and crash fixes', () => {
    expect(textOf(compileEditPrompt(req({ instruction: 'dark mode' })))).toContain('--- components/Hero.tsx ---');
    const crash = textOf(compileEditPrompt(req({ runtimeError: 'X is not defined' })));
    expect(crash).toContain('X is not defined');
    expect(crash).toContain('--- components/Hero.tsx ---');
  });
  it('refuses a whole-page change on a huge project', () => {
    const huge = { ...SAMPLE_FILES, 'components/Big.tsx': 'x'.repeat(MAX_WHOLE_PROJECT_CHARS) };
    expect(compileEditPrompt(req({ files: huge, instruction: 'dark mode' }))).toEqual({ ok: false, error: expect.stringContaining('Point at the part') });
  });
});

describe('editFixPrompt', () => {
  it('lists errors and shows the current contents of the files they name', () => {
    const prompt = editFixPrompt(['components/Header.tsx: the <old> text was not found.', 'Missing App.tsx'], SAMPLE_FILES);
    expect(prompt).toContain('- components/Header.tsx: the <old> text was not found.');
    expect(prompt).toContain('--- components/Header.tsx ---');
    expect(prompt).not.toContain('--- components/Hero.tsx ---');
  });
});
