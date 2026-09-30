import type { Editor, TLShapeId } from 'tldraw';
import { bindWords, toSpeech } from '@/marks/bindWords';
import { looseShapeIds } from '@/marks/planEdit';
import { readFrames, readPendingStrokes } from '@/marks/readBoard';
import type { Word } from '@/marks/types';
import { MAX_NOTE_CHARS } from '@/server/build/parseBuildRequest';
import type { SttTokenResponse } from '@/shared/types';
import { startMicCapture } from '@/voice/micCapture';
import { DIDNT_CATCH, MAX_RECORDING_MS, startRecording, VoiceError, type Recording } from '@/voice/recorder';
import { transcriptOf } from '@/voice/words';
import { postApi } from './api';
import { buildFromSelection } from './buildFromSelection';
import { editStatus, instructionDraft } from './editSession';
import { checkSelection } from './selectionHelpers';
import { sendEdit } from './sendEdit';
import { currentPlan } from './useEditPlan';
import { decideVoiceAction } from './voiceAction';
import { IDLE_VOICE, voiceState } from './voiceSession';

let recording: Recording | null = null;
let autoStop: ReturnType<typeof setTimeout> | undefined;

/** ● Start: open the mic and the STT session. Errors land in the panel's status line. */
export async function startVoice(editor: Editor): Promise<void> {
  if (voiceState.get().phase !== 'idle') return;
  voiceState.set({ ...IDLE_VOICE, phase: 'starting' });
  editStatus.set({ phase: 'idle', text: '' });
  try {
    const { connectScribe } = await import('@/voice/scribeSocket'); // the SDK loads only once voice is used
    recording = await startRecording(
      { fetchToken: () => postApi<SttTokenResponse>('/api/stt-token', {}), connect: connectScribe, startMic: startMicCapture, now: Date.now },
      {
        onPartial: (partial) => voiceState.update((s) => ({ ...s, partial })),
        onFailure: (message) => {
          clearTimeout(autoStop);
          recording = null;
          voiceState.set(IDLE_VOICE);
          editStatus.set({ phase: 'error', text: message });
        },
      },
    );
    voiceState.update((s) => ({ ...s, phase: 'recording', startedAt: Date.now() }));
    autoStop = setTimeout(() => void stopVoice(editor), MAX_RECORDING_MS);
  } catch (err) {
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
  if (await actOnVoice(editor, words, instructionDraft.get())) instructionDraft.set('');
}

/** Drop the recording without acting on it. */
export function cancelVoice(): void {
  clearTimeout(autoStop);
  recording?.cancel();
  recording = null;
  voiceState.set(IDLE_VOICE);
}

async function actOnVoice(editor: Editor, words: Word[], typed: string): Promise<boolean> {
  const said = transcriptOf(words);
  const action = decideVoiceAction({
    said,
    typed,
    plan: currentPlan(editor),
    selectionBuildable: checkSelection(editor.getSelectedShapes()).ok,
    looseShapeIds: looseShapeIds(readPendingStrokes(editor), readFrames(editor)),
  });
  if (action.kind === 'none') {
    editStatus.set({ phase: 'error', text: action.message });
    return false;
  }
  if (action.kind === 'build') return buildFromVoice(editor, action.from, [typed.trim(), said].filter(Boolean).join('\n'));

  const runs = bindWords(action.plan.marks, words);
  voiceState.update((s) => ({ ...s, runs })); // the panel shows what each mark heard while the edit runs
  const ok = await sendEdit(editor, action.plan, typed.trim(), toSpeech(runs));
  if (ok) voiceState.update((s) => ({ ...s, runs: [] }));
  return ok;
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
