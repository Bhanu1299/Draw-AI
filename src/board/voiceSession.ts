import { atom } from 'tldraw';
import type { BoundRun } from '@/marks/bindWords';

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'stopping';

export interface VoiceState {
  phase: VoicePhase;
  startedAt: number;
  /** Live, unconfirmed transcript while recording. */
  partial: string;
  /** What the last instruction's words were bound to, shown until it succeeds or a new one starts. */
  runs: BoundRun[];
}

export const IDLE_VOICE: VoiceState = { phase: 'idle', startedAt: 0, partial: '', runs: [] };

export const voiceState = atom<VoiceState>('voice state', IDLE_VOICE);

/** Dev only: download every voice instruction as an eval case (Task 9). */
export const saveVoiceEvalCases = atom<boolean>('save voice eval cases', false);
