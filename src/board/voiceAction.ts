import { readMarkMeta } from '@/marks/markMeta';
import type { EditPlan, PlanResult } from '@/marks/planEdit';
import { DIDNT_CATCH } from '@/voice/recorder';
import { checkSelection } from './selectionHelpers';

export interface VoiceContext {
  /** The transcript. */
  said: string;
  /** Whatever is in the panel's text box. */
  typed: string;
  plan: PlanResult;
  /** The selection is a sketch or a screenshot (not a page), and not a sketch that was already built. */
  selectionBuildable: boolean;
  /** Exactly one page is selected: the words are for that whole page. */
  pageSelected: boolean;
  /** Pending strokes far from every page, drawn during this recording. */
  looseShapeIds: string[];
}

export type VoiceAction =
  | { kind: 'edit'; plan: EditPlan }
  | { kind: 'build'; from: 'selection' | string[] }
  | { kind: 'none'; message: string };

/**
 * What ■ Stop does. Marks on a page win; then a selected sketch builds; then a selected page changes as a
 * whole; then strokes drawn far from every page build; with nothing drawn, the whole page changes.
 */
export function decideVoiceAction(c: VoiceContext): VoiceAction {
  if (!c.said.trim() && !c.typed.trim()) return { kind: 'none', message: DIDNT_CATCH };
  if (c.plan.ok && c.plan.plan.marks.length > 0) return { kind: 'edit', plan: c.plan.plan };
  if (!c.plan.ok && c.plan.reason === 'loading') return { kind: 'none', message: c.plan.message };
  if (c.selectionBuildable) return { kind: 'build', from: 'selection' };
  if (c.pageSelected && c.plan.ok) return { kind: 'edit', plan: c.plan.plan };
  if (c.looseShapeIds.length > 0) return { kind: 'build', from: c.looseShapeIds };
  if (c.plan.ok) return { kind: 'edit', plan: c.plan.plan };
  return { kind: 'none', message: c.plan.message };
}

/**
 * Whether ■ Stop may build from the selection: a sketch or a screenshot, but not a sketch that was already
 * built (it stays selected after the build, and would otherwise build a second page).
 */
export function voiceCanBuildSelection(shapes: ReadonlyArray<{ type: string; meta: unknown }>): boolean {
  if (!checkSelection(shapes).ok) return false;
  return !shapes.every((s) => readMarkMeta(s)?.used === true);
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
