import type { Editor } from 'tldraw';
import { bindWords, toSpeech } from '@/marks/bindWords';
import { expectationsFor, type EvalCase } from '@/marks/evals/score';
import type { EditPlan } from '@/marks/planEdit';
import { readFrames, readPendingStrokes } from '@/marks/readBoard';
import type { Word } from '@/marks/types';

/** Dev tool: download the current marks (and words) as an eval case. Check `expected*` by hand, set `reviewed: true`, then save it to src/marks/evals/cases/. */
export function recordEvalCase(editor: Editor, plan: EditPlan, words?: Word[]): void {
  const ids = new Set(plan.marks.flatMap((m) => m.shapeIds));
  const evalCase: EvalCase = {
    name: `recorded-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    frames: readFrames(editor).filter((f) => f.id === plan.frameId),
    strokes: readPendingStrokes(editor).filter((s) => ids.has(s.shapeId)),
    selectedFrameId: null,
    expected: expectationsFor(plan),
    ...(words ? { words, expectedSpeech: toSpeech(bindWords(plan.marks, words)) } : {}),
    reviewed: false, // the eval fails until someone checks the expectations and sets this to true
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(evalCase, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${evalCase.name}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
