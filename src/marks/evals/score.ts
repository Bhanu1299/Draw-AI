import type { Gesture, MarkTarget, SpeechRun } from '@/shared/types';
import { bindWords, toSpeech } from '../bindWords';
import { planEdit, type EditPlan } from '../planEdit';
import type { FrameInfo, Stroke, Word } from '../types';

export interface Score {
  correct: number;
  total: number;
  failures: string[];
}

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
  /** Words said while drawing (voice recordings), on the stroke clock. */
  words?: Word[];
  /** What the words should bind to, in order. */
  expectedSpeech?: SpeechRun[];
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

export function scoreCase(c: EvalCase): Score {
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
const plain = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** Speech runs in order: each must match its mark and its words (case and punctuation ignored). */
export function scoreSpeech(c: EvalCase): Score {
  if (!c.words || !c.expectedSpeech) return { correct: 0, total: 0, failures: [] };
  const result = planEdit(c.strokes, c.frames, c.selectedFrameId);
  const got = result.ok ? toSpeech(bindWords(result.plan.marks, c.words)) : [];
  const total = Math.max(got.length, c.expectedSpeech.length);
  const failures: string[] = [];
  let correct = 0;
  for (let i = 0; i < total; i++) {
    const want = c.expectedSpeech[i];
    const have = got[i];
    if (want && have && want.mark === have.mark && plain(want.text) === plain(have.text)) correct++;
    else failures.push(`${c.name} speech #${i + 1}: expected ${want ? JSON.stringify(want) : 'nothing'}, got ${have ? JSON.stringify(have) : 'nothing'}`);
  }
  return { correct, total, failures };
}
