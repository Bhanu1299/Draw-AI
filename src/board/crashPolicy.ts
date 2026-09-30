import { LIBS_FAILED_MESSAGE } from '@/preview/runtimeHtml';

/** How long after an AI edit a crash counts as "the edit broke the page". Covers loading libraries from the CDN. */
export const VERIFY_WINDOW_MS = 15_000;

export interface CrashRecord {
  appliedAt: number;
  fixAttempted: boolean;
  /** A fix request is in flight: further error reports are echoes of the same crash. */
  fixing: boolean;
}

export type CrashAction = 'fix' | 'revert' | 'ignore';

/** Spec §6.3: one automatic fix for a runtime error; if that fails, keep the previous version. */
export function decideOnCrash(record: CrashRecord | undefined, now: number, message: string): CrashAction {
  // The CDN failed to load, not the page's code: a fix would spend credits and a revert would lose a good edit.
  if (!record || record.fixing || message === LIBS_FAILED_MESSAGE) return 'ignore';
  if (now - record.appliedAt > VERIFY_WINDOW_MS) return 'ignore';
  return record.fixAttempted ? 'revert' : 'fix';
}
