import type { Gesture, MarkTarget } from '@/shared/types';
import { planEdit, type EditPlan } from '../planEdit';
import type { FrameInfo, Stroke } from '../types';

export interface EvalExpectation {
  n: number;
  gesture: Gesture;
  /** data-src of each targeted element (any order), or ["region"] for a new region. */
  targets: string[];
  pointsTo?: string[];
}

/** One recorded or synthetic instruction: board state in, expected marks out. */
export interface EvalCase {
  name: string;
  frames: FrameInfo[];
  strokes: Stroke[];
  selectedFrameId: string | null;
  expected: EvalExpectation[];
}

export function targetKey(target: MarkTarget): string[] {
  return target.kind === 'region' ? ['region'] : target.elements.map((e) => e.src).sort();
}

export function expectationsFor(plan: EditPlan): EvalExpectation[] {
  return plan.marks.map((m) => ({
    n: m.n,
    gesture: m.gesture,
    targets: targetKey(m.hit.target),
    ...(m.hit.pointsTo ? { pointsTo: targetKey(m.hit.pointsTo) } : {}),
  }));
}

const normalize = (e: EvalExpectation) =>
  JSON.stringify({ n: e.n, gesture: e.gesture, targets: [...e.targets].sort(), pointsTo: e.pointsTo ? [...e.pointsTo].sort() : null });

export function scoreCase(c: EvalCase): { correct: number; total: number; failures: string[] } {
  const result = planEdit(c.strokes, c.frames, c.selectedFrameId);
  const actual = result.ok ? expectationsFor(result.plan) : [];
  const failures: string[] = [];
  let correct = 0;
  for (const want of c.expected) {
    const got = actual.find((a) => a.n === want.n);
    if (got && normalize(got) === normalize(want)) correct++;
    else failures.push(`${c.name} #${want.n}: expected ${normalize(want)}, got ${got ? normalize(got) : result.ok ? 'no such mark' : result.message}`);
  }
  return { correct, total: c.expected.length, failures };
}
