import { describe, expect, it } from 'vitest';
import type { PlannedMark, PlanResult } from '@/marks/planEdit';
import { DIDNT_CATCH } from '@/voice/recorder';
import { MARK_META_KEY } from '@/marks/markMeta';
import { appendSpeech, decideVoiceAction, formatElapsed, voiceCanBuildSelection, type VoiceContext } from './voiceAction';

const withMarks = (count: number): PlanResult => ({
  ok: true,
  plan: { frameId: 'shape:page', marks: Array.from({ length: count }, (_, i) => ({ n: i + 1 }) as PlannedMark) },
});
const ctx = (over: Partial<VoiceContext>): VoiceContext => ({
  said: 'make these smaller',
  typed: '',
  plan: withMarks(1),
  selectionBuildable: false,
  pageSelected: false,
  looseShapeIds: [],
  ...over,
});
const noFrame: PlanResult = { ok: false, reason: 'no-frame', message: 'Draw on or next to a page to change it.' };

describe('decideVoiceAction', () => {
  it("says it didn't catch anything when nothing was said or typed, and sends nothing", () => {
    expect(decideVoiceAction(ctx({ said: '' }))).toEqual({ kind: 'none', message: DIDNT_CATCH });
    const plan = withMarks(1);
    expect(decideVoiceAction(ctx({ said: ' ', typed: 'blue', plan }))).toEqual({ kind: 'edit', plan: plan.ok && plan.plan });
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
    const plan = withMarks(0);
    expect(decideVoiceAction(ctx({ plan }))).toEqual({ kind: 'edit', plan: plan.ok && plan.plan });
  });
  it('edits a selected page instead of building from loose strokes elsewhere', () => {
    const plan = withMarks(0);
    expect(decideVoiceAction(ctx({ plan, pageSelected: true, looseShapeIds: ['shape:old-note'] }))).toEqual({
      kind: 'edit',
      plan: plan.ok && plan.plan,
    });
  });
  it('builds from a selected sketch before looking at the selected page or loose strokes', () => {
    expect(decideVoiceAction(ctx({ plan: withMarks(0), selectionBuildable: true, looseShapeIds: ['shape:a'] }))).toEqual({
      kind: 'build',
      from: 'selection',
    });
  });
  it('builds from loose strokes when no page is selected, even if a single page could take the words', () => {
    expect(decideVoiceAction(ctx({ plan: withMarks(0), looseShapeIds: ['shape:a'] }))).toEqual({ kind: 'build', from: ['shape:a'] });
  });
  it('explains when there is nothing to act on', () => {
    const none: PlanResult = { ok: false, reason: 'no-marks', message: 'Circle something first.' };
    expect(decideVoiceAction(ctx({ plan: none }))).toEqual({ kind: 'none', message: 'Circle something first.' });
  });
});

describe('voiceCanBuildSelection', () => {
  const mark = (used: boolean) => ({ type: 'draw', meta: { [MARK_META_KEY]: { t0: 1, t1: 2, used } } });
  it('builds from a fresh sketch or a screenshot', () => {
    expect(voiceCanBuildSelection([mark(false)])).toBe(true);
    expect(voiceCanBuildSelection([mark(true), mark(false)])).toBe(true);
    expect(voiceCanBuildSelection([{ type: 'image', meta: {} }])).toBe(true);
  });
  it('does not rebuild a sketch that was already built (it stays selected afterwards)', () => {
    expect(voiceCanBuildSelection([mark(true)])).toBe(false);
    expect(voiceCanBuildSelection([mark(true), mark(true)])).toBe(false);
  });
  it('never builds from nothing or from a page', () => {
    expect(voiceCanBuildSelection([])).toBe(false);
    expect(voiceCanBuildSelection([{ type: 'drawai-frame', meta: {} }])).toBe(false);
  });
});

describe('appendSpeech', () => {
  it('keeps what was said in the text box so it can be fixed and sent as text', () => {
    expect(appendSpeech('', 'make these smaller')).toBe('make these smaller');
    expect(appendSpeech('blue', 'make these smaller')).toBe('blue\nmake these smaller');
    expect(appendSpeech('  ', 'make these smaller')).toBe('make these smaller');
  });
  it('leaves the text box alone when nothing was said', () => {
    expect(appendSpeech('blue', '  ')).toBe('blue');
    expect(appendSpeech('', '')).toBe('');
  });
});

describe('formatElapsed', () => {
  it('shows minutes and seconds', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(7_900)).toBe('0:07');
    expect(formatElapsed(61_000)).toBe('1:01');
  });
});
