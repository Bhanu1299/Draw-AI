import { describe, expect, it } from 'vitest';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';

const textOf = (parts: ReturnType<typeof buildUserContent>) =>
  parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n');

describe('prompt', () => {
  it('lists the allowed packages in the system prompt', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('react, lucide-react');
  });
  it('tells the model not to use viewport-height units', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('Never use viewport-height units');
  });
  it('sends the images first, in order, then the kind and note', () => {
    const content = buildUserContent({ kind: 'screenshot', images: ['AAAA'], note: '  dark theme ' });
    expect(content[0]).toEqual({ type: 'image', pngBase64: 'AAAA' });
    expect(content[1].type).toBe('text');
    expect(textOf(content)).toContain('Input type: screenshot');
    expect(textOf(content)).toContain('User note: dark theme');
  });
  it('explains that several images are slices of one tall image', () => {
    const content = buildUserContent({ kind: 'screenshot', images: ['A', 'B', 'C'], note: '' });
    expect(content.slice(0, 3)).toEqual([
      { type: 'image', pngBase64: 'A' },
      { type: 'image', pngBase64: 'B' },
      { type: 'image', pngBase64: 'C' },
    ]);
    expect(textOf(content)).toContain('3 slices');
  });
  it('omits the note line when the note is blank and the slice line for one image', () => {
    const text = textOf(buildUserContent({ kind: 'sketch', images: ['A'], note: '   ' }));
    expect(text).not.toContain('User note');
    expect(text).not.toContain('slices');
  });
  it('lists every error in the fix prompt', () => {
    const prompt = buildFixPrompt(['App.tsx: bad', 'Hero.tsx: worse']);
    expect(prompt).toContain('- App.tsx: bad');
    expect(prompt).toContain('- Hero.tsx: worse');
  });
});
