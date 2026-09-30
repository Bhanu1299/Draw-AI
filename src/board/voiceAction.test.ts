import { describe, expect, it } from 'vitest';
import type { PlannedMark, PlanResult } from '@/marks/planEdit';
import { DIDNT_CATCH } from '@/voice/recorder';
import { decideVoiceAction, formatElapsed, type VoiceContext } from './voiceAction';

const withMarks = (count: number): PlanResult => ({
  ok: true,
  plan: { frameId: 'shape:page', marks: Array.from({ length: count }, (_, i) => ({ n: i + 1 }) as PlannedMark) },
});
const ctx = (over: Partial<VoiceContext>): VoiceContext => ({
  said: 'make these smaller',
  typed: '',
  plan: withMarks(1),
  selectionBuildable: false,
  looseShapeIds: [],
  ...over,
});
const noFrame: PlanResult = { ok: false, reason: 'no-frame', message: 'Draw on or next to a page to change it.' };

describe('decideVoiceAction', () => {
  it("says it didn't catch anything when nothing was said or typed, and sends nothing", () => {
    expect(decideVoiceAction(ctx({ said: '' }))).toEqual({ kind: 'none', message: DIDNT_CATCH });
    expect(decideVoiceAction(ctx({ said: ' ', typed: 'blue' })).kind).toBe('edit');
  });
  it('edits when marks point at a page, even with a sketch selected', () => {
    const plan = withMarks(2);
    expect(decideVoiceAction(ctx({ plan, selectionBuildable: true }))).toEqual({ kind: 'edit', plan: plan.ok && plan.plan });
  });
  it('waits for a loading page instead of building', () => {
    const loading: PlanResult = { ok: false, reason: 'loading', message: 'The page is still loading.' };
    expect(decideVoiceAction(ctx({ plan: loading, selectionBuildable: true }))).toEqual({ kind: 'none', message: 'The page is still loading.' });
  });
  it('builds from a selected sketch or screenshot', () => {
    expect(decideVoiceAction(ctx({ plan: noFrame, selectionBuildable: true }))).toEqual({ kind: 'build', from: 'selection' });
  });
  it('builds from loose sketch strokes when nothing is selected', () => {
    expect(decideVoiceAction(ctx({ plan: noFrame, looseShapeIds: ['shape:a'] }))).toEqual({ kind: 'build', from: ['shape:a'] });
  });
  it('edits the whole page when nothing is drawn', () => {
    expect(decideVoiceAction(ctx({ plan: withMarks(0) })).kind).toBe('edit');
  });
  it('explains when there is nothing to act on', () => {
    const none: PlanResult = { ok: false, reason: 'no-marks', message: 'Circle something first.' };
    expect(decideVoiceAction(ctx({ plan: none }))).toEqual({ kind: 'none', message: 'Circle something first.' });
  });
});

describe('formatElapsed', () => {
  it('shows minutes and seconds', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(7_900)).toBe('0:07');
    expect(formatElapsed(61_000)).toBe('1:01');
  });
});
