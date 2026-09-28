import { describe, expect, it, vi } from 'vitest';
import type { BuildRequest } from '@/shared/types';
import { buildProject, type Generate } from './buildProject';

const REQ: BuildRequest = { kind: 'sketch', imageBase64: 'AAAA', note: '' };
const VALID =
  '<file path="App.tsx">export default function App() { return <main className="p-8">Hi</main>; }</file>\n<summary>A simple page</summary>';
const INVALID =
  '<file path="App.tsx">import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }</file>';

function fakeGenerate(...replies: string[]): Generate & ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const reply of replies) fn.mockResolvedValueOnce(reply);
  return fn as Generate & ReturnType<typeof vi.fn>;
}

describe('buildProject', () => {
  it('returns files and summary when the first answer is valid', async () => {
    const generate = fakeGenerate(VALID);
    const result = await buildProject(REQ, generate);
    expect(result).toMatchObject({ ok: true, summary: 'A simple page' });
    expect(result.ok && Object.keys(result.files)).toEqual(['App.tsx']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('sends compile errors back once and uses the fixed files', async () => {
    const generate = fakeGenerate(INVALID, VALID);
    const result = await buildProject(REQ, generate);
    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    const retry = generate.mock.calls[1][0] as Parameters<Generate>[0];
    expect(retry.messages).toHaveLength(3);
    expect(JSON.stringify(retry.messages[2].content)).toContain('framer-motion');
  });

  it('recovers when the first attempt left a stray broken file behind', async () => {
    const stray = VALID.replace('</file>', '</file>\n<file path="components/Old.tsx">export default function O() { return <div> }</file>');
    const generate = fakeGenerate(stray);
    const result = await buildProject(REQ, generate);
    expect(result.ok && Object.keys(result.files)).toEqual(['App.tsx']);
  });

  it('gives a readable error when the retry is still broken', async () => {
    const generate = fakeGenerate(INVALID, INVALID);
    const result = await buildProject(REQ, generate);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^Couldn't build a working page: .*framer-motion/);
  });
});
