import { computed, useValue, type Computed, type Editor } from 'tldraw';
import { planEdit, type PlanResult } from '@/marks/planEdit';
import { readFrames, readPendingStrokes, selectedFrameId } from '@/marks/readBoard';

// One shared computed per editor, so the panel and the badges don't each re-plan on every change.
const plans = new WeakMap<Editor, Computed<PlanResult>>();

function planFor(editor: Editor): Computed<PlanResult> {
  let plan = plans.get(editor);
  if (!plan) {
    plan = computed('edit plan', () => planEdit(readPendingStrokes(editor), readFrames(editor), selectedFrameId(editor)));
    plans.set(editor, plan);
  }
  return plan;
}

/** The live edit plan. Recomputes when marks, frames, element maps or the selection change. */
export function useEditPlan(editor: Editor): PlanResult {
  return useValue(planFor(editor));
}
