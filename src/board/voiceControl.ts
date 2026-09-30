import type { Editor, TLShapeId } from 'tldraw';
import { bindWords, toSpeech } from '@/marks/bindWords';
import { looseShapeIds } from '@/marks/planEdit';
import { readFrames, readPendingStrokes, selectedFrameId } from '@/marks/readBoard';
import type { Word } from '@/marks/types';
import { MAX_NOTE_CHARS } from '@/server/build/parseBuildRequest';
import type { SttTokenResponse } from '@/shared/types';
import { startMicCapture } from '@/voice/micCapture';
import { DIDNT_CATCH, MAX_RECORDING_MS, startRecording, VoiceError, type Recording } from '@/voice/recorder';
import { transcriptOf } from '@/voice/words';
import { postApi } from './api';
import { buildFromSelection } from './buildFromSelection';
import { editStatus, instructionDraft } from './editSession';
import { recordEvalCase } from './recordEvalCase';
import { sendEdit } from './sendEdit';
import { currentPlan } from './useEditPlan';
import { appendSpeech, decideVoiceAction, voiceCanBuildSelection } from './voiceAction';
import { IDLE_VOICE, saveVoiceEvalCases, voiceState } from './voiceSession';

let recording: Recording | null = null;
let autoStop: ReturnType<typeof setTimeout> | undefined;
/** Bumped by cancelVoice and each start, so a start that finishes late can tell it was cancelled or superseded. */
let generation = 0;
/** When ● Start was pressed (stroke clock): only strokes drawn since then can be a new sketch to build. */
let clickedAt = 0;

/** ● Start: open the mic and the STT session. Errors land in the panel's status line. */
export async function startVoice(editor: Editor): Promise<void> {
  if (voiceState.get().phase !== 'idle') return;
  if (editStatus.get().phase === 'working') return; // an edit or build is running
  const mine = ++generation;
  clickedAt = Date.now();
  voiceState.set({ ...IDLE_VOICE, phase: 'starting' });
  editStatus.set({ phase: 'idle', text: '' });
  try {
    const { connectScribe } = await import('@/voice/scribeSocket'); // the SDK loads only once voice is used
    const started = await startRecording(
      { fetchToken: () => postApi<SttTokenResponse>('/api/stt-token', {}), connect: connectScribe, startMic: startMicCapture, now: Date.now },
      {
        onPartial: (partial) => voiceState.update((s) => ({ ...s, partial })),
        onFailure: (message) => {
          if (mine !== generation) return;
          clearTimeout(autoStop);
          recording = null;
          voiceState.set(IDLE_VOICE);
          editStatus.set({ phase: 'error', text: message });
        },
      },
    );
    if (mine !== generation) {
      started.cancel(); // cancelled or superseded while starting: release the mic
      return;
    }
    recording = started;
    voiceState.update((s) => ({ ...s, phase: 'recording', startedAt: Date.now() }));
    autoStop = setTimeout(() => void stopVoice(editor), MAX_RECORDING_MS);
  } catch (err) {
    if (mine !== generation) return;
    recording = null;
    voiceState.set(IDLE_VOICE);
    editStatus.set({ phase: 'error', text: err instanceof VoiceError ? err.message : 'Could not start listening. Try again, or type below.' });
  }
}

/** ■ Stop: collect the words, then edit a page or build a sketch with them. */
export async function stopVoice(editor: Editor): Promise<void> {
  const active = recording;
  if (!active || voiceState.get().phase !== 'recording') return;
  recording = null;
  clearTimeout(autoStop);
  voiceState.update((s) => ({ ...s, phase: 'stopping', partial: '' }));
  let words: Word[];
  try {
    words = await active.stop();
  } catch (err) {
    voiceState.set(IDLE_VOICE);
    editStatus.set({ phase: 'error', text: err instanceof VoiceError ? err.message : DIDNT_CATCH });
    return;
  }
  voiceState.set(IDLE_VOICE);
  if (await actOnVoice(editor, words, instructionDraft.get(), clickedAt)) instructionDraft.set('');
}

/** Drop the recording without acting on it. */
export function cancelVoice(): void {
  generation++;
  clearTimeout(autoStop);
  recording?.cancel();
  recording = null;
  voiceState.set(IDLE_VOICE);
}

async function actOnVoice(editor: Editor, words: Word[], typed: string, since: number): Promise<boolean> {
  const said = transcriptOf(words);
  const action = decideVoiceAction({
    said,
    typed,
    plan: currentPlan(editor),
    selectionBuildable: voiceCanBuildSelection(editor.getSelectedShapes()),
    pageSelected: selectedFrameId(editor) !== null,
    // Old unused strokes (a note from earlier) are not a new sketch: only what was drawn while talking.
    looseShapeIds: looseShapeIds(readPendingStrokes(editor).filter((s) => s.t0 >= since), readFrames(editor)),
  });
  if (action.kind === 'none') {
    editStatus.set({ phase: 'error', text: action.message });
    keepSpeech(said); // up to a minute of talking isn't lost: it can be fixed and sent as text
    return false;
  }
  if (action.kind === 'build') return buildFromVoice(editor, action.from, [typed.trim(), said].filter(Boolean).join('\n'));

  const runs = bindWords(action.plan.marks, words);
  if (process.env.NODE_ENV !== 'production' && saveVoiceEvalCases.get()) recordEvalCase(editor, action.plan, words);
  voiceState.update((s) => ({ ...s, runs })); // the panel shows what each mark heard while the edit runs
  let ok = false;
  try {
    ok = await sendEdit(editor, action.plan, typed.trim(), toSpeech(runs));
  } finally {
    voiceState.update((s) => ({ ...s, runs: [] })); // stale runs would attach old words to the next marks
    if (!ok) keepSpeech(said);
  }
  return ok;
}

/** Put the transcript in the text box, after anything typed there. */
function keepSpeech(said: string): void {
  instructionDraft.set(appendSpeech(instructionDraft.get(), said));
}

async function buildFromVoice(editor: Editor, from: 'selection' | string[], note: string): Promise<boolean> {
  if (from !== 'selection') editor.select(...(from as TLShapeId[]));
  editStatus.set({ phase: 'working', text: 'Building your page…' });
  try {
    const result = await buildFromSelection(editor, note.slice(0, MAX_NOTE_CHARS));
    editStatus.set(result.ok ? { phase: 'done', text: 'Built a page from your sketch.' } : { phase: 'error', text: result.error });
    return result.ok;
  } catch {
    editStatus.set({ phase: 'error', text: 'Something went wrong while exporting your sketch. Please try again.' });
    return false;
  }
}
