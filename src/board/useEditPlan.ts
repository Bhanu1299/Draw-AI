import { useValue, type Editor } from 'tldraw';
import { planEdit, type PlanResult } from '@/marks/planEdit';
import { readFrames, readPendingStrokes, selectedFrameId } from '@/marks/readBoard';

/** The live edit plan. Recomputes when marks, frames, element maps or the selection change. */
export function useEditPlan(editor: Editor): PlanResult {
  return useValue('edit plan', () => planEdit(readPendingStrokes(editor), readFrames(editor), selectedFrameId(editor)), [editor]);
}
