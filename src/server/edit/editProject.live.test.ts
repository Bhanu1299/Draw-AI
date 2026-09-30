import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest, MarkTarget, ProjectFiles, Segment, TargetElement } from '@/shared/types';
import { EDIT_TIMEOUT_MS, editProject } from './editProject';

const LIVE = process.env.EVAL_LIVE === '1';
const nav: TargetElement = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Product Pricing Blog' };
const hero: TargetElement = { src: 'components/Hero.tsx:5:5', tag: 'section', text: 'Sketch it. Ship it.' };
const para: TargetElement = { src: 'components/Hero.tsx:7:7', tag: 'p', text: 'Draw your idea and get a real page.' };
const button: TargetElement = { src: 'components/Hero.tsx:8:7', tag: 'button', text: 'Get started' };

const on = (...elements: TargetElement[]): MarkTarget => ({ kind: 'elements', elements });
const seg = (n: number, gesture: Segment['gesture'], target: MarkTarget, wrote: string[] = []): Segment => ({ n, gesture, target, unsure: false, wrote });
const below: MarkTarget = {
  kind: 'region',
  region: { width: 1100, height: 300, left: 90, top: 420, fullWidth: true, outside: null, inside: null, elementAbove: hero, elementBelow: null, covers: [] },
};
const all = (files: ProjectFiles) => Object.values(files).join('\n');

const CASES: Array<{ name: string; request: EditRequest; check: (files: ProjectFiles) => boolean }> = [
  {
    name: 'circle nav: bigger and bold',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'circle', on(nav))], instruction: '1 bigger and bold' },
    check: (f) => f['components/Header.tsx'] !== SAMPLE_FILES['components/Header.tsx'] && /font-(semibold|bold)/.test(f['components/Header.tsx']),
  },
  {
    name: 'arrow at button: blue',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'arrow', on(button))], instruction: 'make it blue' },
    check: (f) => /bg-blue-\d+/.test(f['components/Hero.tsx']),
  },
  {
    name: 'cross out the paragraph',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'cross-out', on(para))], instruction: '' },
    check: (f) => !all(f).includes('Draw your idea'),
  },
  {
    name: 'sketch testimonials below the hero',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'sketch', below, ['Testimonials'])], instruction: 'add three testimonial cards here' },
    check: (f) => /testimonial/i.test(all(f)),
  },
  {
    name: 'whole page dark',
    request: { files: SAMPLE_FILES, segments: [], instruction: 'make the whole page dark mode' },
    check: (f) => /bg-(slate|zinc|gray|neutral|stone)-(8|9)\d\d|bg-black/.test(all(f)),
  },
];

describe.skipIf(!LIVE)('live edit eval (spec §9.2 edit success, with real AI)', () => {
  it('edits the sample page', async () => {
    process.loadEnvFile('.env.local');
    const { selectProvider } = await import('@/server/ai/provider');
    const selected = selectProvider(process.env);
    if (!selected.ok) throw new Error(selected.error);

    const results = [];
    for (const c of CASES) {
      const started = Date.now();
      const response = await editProject(c.request, selected.provider.generate, AbortSignal.timeout(EDIT_TIMEOUT_MS)).catch(
        (err: unknown) => ({ ok: false as const, error: String(err) }),
      );
      results.push({
        name: c.name,
        ok: response.ok && c.check(response.files),
        ms: Date.now() - started,
        error: response.ok ? '' : response.error,
      });
    }
    const times = results.map((r) => r.ms).sort((a, b) => a - b);
    const report = {
      model: selected.provider.model,
      successRate: results.filter((r) => r.ok).length / results.length,
      medianMs: times[Math.floor(times.length / 2)],
      results,
    };
    mkdirSync('.eval', { recursive: true });
    writeFileSync('.eval/edits-latest.json', JSON.stringify(report, null, 2));
    // 5 cases: one miss is 80%. The 90% target applies to the full recorded set (M2b).
    expect(report.successRate, JSON.stringify(results, null, 2)).toBeGreaterThanOrEqual(0.8);
  }, 600_000);
});
