import { describe, expect, it } from 'vitest';
import type { ChatMessage, Generate } from '@/server/ai/chat';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest } from '@/shared/types';
import { editProject, MAX_FIX_ROUNDS } from './editProject';

const REQ: EditRequest = { files: SAMPLE_FILES, segments: [], instruction: 'bigger title' };
const GOOD = '<edit path="components/Hero.tsx"><old>text-5xl</old><new>text-6xl</new></edit><summary>Bigger title.</summary>';

function scripted(...answers: string[]) {
  const calls: Array<{ messages: ChatMessage[]; signal?: AbortSignal }> = [];
  const generate: Generate = async ({ messages, signal }) => {
    calls.push({ messages: [...messages], signal });
    return answers[calls.length - 1] ?? '';
  };
  return { generate, calls };
}

const lastUserText = (messages: ChatMessage[]) => {
  const last = messages[messages.length - 1];
  return typeof last.content === 'string' ? last.content : '';
};

describe('editProject', () => {
  it('applies a clean edit on the first try', async () => {
    const { generate, calls } = scripted(GOOD);
    const result = await editProject(REQ, generate);
    expect(result).toEqual({ ok: true, files: { ...SAMPLE_FILES, 'components/Hero.tsx': SAMPLE_FILES['components/Hero.tsx'].replace('text-5xl', 'text-6xl') }, summary: 'Bigger title.' });
    expect(calls).toHaveLength(1);
  });
  it('passes the abort signal through', async () => {
    const { generate, calls } = scripted(GOOD);
    const signal = new AbortController().signal;
    await editProject(REQ, generate, signal);
    expect(calls[0].signal).toBe(signal);
  });
  it('sends apply errors back with the current file, then succeeds', async () => {
    const { generate, calls } = scripted('<edit path="components/Hero.tsx"><old>text-9xl</old><new>x</new></edit>', GOOD);
    const result = await editProject(REQ, generate);
    expect(result.ok).toBe(true);
    const fix = lastUserText(calls[1].messages);
    expect(fix).toContain('the <old> text was not found');
    expect(fix).toContain('--- components/Hero.tsx ---');
  });
  it('sends compile errors back, and the fix builds on the broken file', async () => {
    const broken =
      '<edit path="components/Hero.tsx"><old>text-5xl font-extrabold tracking-tight">Sketch it. Ship it.</h1></old><new>text-6xl"><h1></new></edit>';
    const repair =
      '<edit path="components/Hero.tsx"><old>text-6xl"><h1></old><new>text-6xl">Sketch it. Ship it.</h1></new></edit><summary>Bigger title.</summary>';
    const { generate, calls } = scripted(broken, repair);
    const result = await editProject(REQ, generate);
    expect(calls).toHaveLength(2);
    expect(lastUserText(calls[1].messages)).toMatch(/^These problems[\s\S]*- components\/Hero\.tsx: /);
    expect(result.ok && result.files['components/Hero.tsx']).toContain('<h1 className="text-6xl">Sketch it. Ship it.</h1>');
  });
  it('treats an answer with no change blocks as an error to fix', async () => {
    const { generate, calls } = scripted('Sure! I made it bigger.', GOOD);
    expect((await editProject(REQ, generate)).ok).toBe(true);
    expect(lastUserText(calls[1].messages)).toContain('No <edit>, <file> or <delete> blocks');
  });
  it('gives up after the fix rounds with a readable error', async () => {
    const bad = '<edit path="components/Hero.tsx"><old>nope</old><new>x</new></edit>';
    const { generate, calls } = scripted(bad, bad, bad, bad);
    const result = await editProject(REQ, generate);
    expect(calls).toHaveLength(MAX_FIX_ROUNDS + 1);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Couldn't apply that: .*Try rephrasing or pointing more precisely\.$/) });
  });
  it('fails fast when the prompt cannot be built', async () => {
    const { generate, calls } = scripted(GOOD);
    const huge = { ...SAMPLE_FILES, 'components/Big.tsx': 'x'.repeat(200_000) };
    expect((await editProject({ ...REQ, files: huge }, generate)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
