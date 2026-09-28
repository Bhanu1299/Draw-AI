import { describe, expect, it } from 'vitest';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';

describe('prompt', () => {
  it('lists the allowed packages in the system prompt', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('react, lucide-react');
  });
  it('tells the model not to use viewport-height units', () => {
    expect(BUILD_SYSTEM_PROMPT).toContain('Never use viewport-height units');
  });
  it('sends the image first, then the kind and note', () => {
    const content = buildUserContent({ kind: 'screenshot', imageBase64: 'AAAA', note: '  dark theme ' });
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
    expect(content[1]).toMatchObject({ type: 'text' });
    const text = content[1].type === 'text' ? content[1].text : '';
    expect(text).toContain('Input type: screenshot');
    expect(text).toContain('User note: dark theme');
  });
  it('omits the note line when the note is blank', () => {
    const content = buildUserContent({ kind: 'sketch', imageBase64: 'AAAA', note: '   ' });
    const text = content[1].type === 'text' ? content[1].text : '';
    expect(text).not.toContain('User note');
  });
  it('lists every error in the fix prompt', () => {
    const prompt = buildFixPrompt(['App.tsx: bad', 'Hero.tsx: worse']);
    expect(prompt).toContain('- App.tsx: bad');
    expect(prompt).toContain('- Hero.tsx: worse');
  });
});
