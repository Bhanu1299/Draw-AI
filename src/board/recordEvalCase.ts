import type { Editor } from 'tldraw';
import { expectationsFor, type EvalCase } from '@/marks/evals/score';
import type { EditPlan } from '@/marks/planEdit';
import { readFrames, readPendingStrokes } from '@/marks/readBoard';

/** Dev tool: download the current marks as a targeting eval case. Check `expected` by hand, then save it to src/marks/evals/cases/. */
export function recordEvalCase(editor: Editor, plan: EditPlan): void {
  const ids = new Set(plan.marks.flatMap((m) => m.shapeIds));
  const evalCase: EvalCase = {
    name: `recorded-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    frames: readFrames(editor).filter((f) => f.id === plan.frameId),
    strokes: readPendingStrokes(editor).filter((s) => ids.has(s.shapeId)),
    selectedFrameId: null,
    expected: expectationsFor(plan),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(evalCase, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${evalCase.name}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
