import { atom, type TLShape, type TLShapeId } from 'tldraw';
import type { ProjectFiles } from '@/shared/types';
import type { CrashRecord } from './crashPolicy';

export type EditStatus = { phase: 'idle' | 'working' | 'done' | 'error'; text: string };

/** What the instruction panel shows under the Send button. */
export const editStatus = atom<EditStatus>('edit status', { phase: 'idle', text: '' });

/** The last AI edit per frame: enough to fix it once or put everything back. */
export interface EditRecord extends CrashRecord {
  frameId: TLShapeId;
  previousFiles: ProjectFiles;
  /** The mark shapes the edit consumed, restored on revert. */
  marks: TLShape[];
}

const records = new Map<TLShapeId, EditRecord>();

export function rememberEdit(record: EditRecord): void {
  records.set(record.frameId, record);
}

export function getEditRecord(frameId: TLShapeId): EditRecord | undefined {
  return records.get(frameId);
}

export function forgetEdit(frameId: TLShapeId): void {
  records.delete(frameId);
}

/** The panel's text box. Voice reads it too, so typed and spoken instructions go out together. */
export const instructionDraft = atom<string>('instruction draft', '');
