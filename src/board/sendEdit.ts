import type { Editor, TLShapeId } from 'tldraw';
import type { FrameShape } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { needsInk, planShapeIds, statusLine, toSegment, type EditPlan, type PlannedMark } from '@/marks/planEdit';
import { unionRects } from '@/shared/geometry';
import type { EditRequest, EditResponse, SpeechRun } from '@/shared/types';
import { postApi } from './api';
import { decideOnCrash } from './crashPolicy';
import { editStatus, forgetEdit, getEditRecord, rememberEdit, type EditRecord } from './editSession';
import { blobToBase64 } from './imageData';
import { fitScale } from './selectionHelpers';

const INK_MAX_PX = 512;
const INK_PADDING = 16;
const FAILED = "Couldn't apply that. Try rephrasing or pointing more precisely.";

function getFrame(editor: Editor, id: string): FrameShape | undefined {
  const shape = editor.getShape(id as TLShapeId);
  return shape?.type === FRAME_TYPE ? (shape as FrameShape) : undefined;
}

function fail(text: string): false {
  editStatus.set({ phase: 'error', text });
  return false;
}

/** Send the plan, instruction and speech; apply the result and remove the sent marks as one undo step. */
export async function sendEdit(editor: Editor, plan: EditPlan, instruction: string, speech: SpeechRun[] = []): Promise<boolean> {
  const frame = getFrame(editor, plan.frameId);
  if (!frame) return fail('That page is gone. Draw on another page.');
  const files = frame.props.files;
  editStatus.set({ phase: 'working', text: statusLine(plan) });

  const segments = await Promise.all(
    plan.marks.map(async (mark) => toSegment(mark, needsInk(mark) ? await inkPng(editor, mark) : undefined)),
  );
  const response = await postApi<EditResponse>('/api/edit', {
    files,
    segments,
    instruction,
    ...(speech.length > 0 ? { speech } : {}),
  } satisfies EditRequest);

  const current = getFrame(editor, plan.frameId);
  if (!current) return fail('The page was removed before the edit finished.');
  if (!response.ok) return fail(response.error);
  // An undo or another edit changed the page meanwhile: applying now would silently drop that change.
  if (current.props.files !== files) return fail('The page changed while editing. Try again.');

  // Only the marks that were sent: strokes drawn while waiting stay as the next marks.
  const markIds = planShapeIds(plan)
    .map((id) => id as TLShapeId)
    .filter((id) => editor.getShape(id));
  const marks = markIds.map((id) => editor.getShape(id)!);
  // One undo step: ⌘Z brings back the old page and its marks together.
  editor.markHistoryStoppingPoint('edit');
  editor.run(() => {
    editor.updateShape({ id: current.id, type: FRAME_TYPE, props: { files: response.files } });
    editor.deleteShapes(markIds);
  });
  rememberEdit({ frameId: current.id, previousFiles: files, marks, appliedAt: Date.now(), fixAttempted: false, fixing: false });
  editStatus.set({ phase: 'done', text: response.summary });
  return true;
}

/** Called for every runtime error a preview reports; acts only on pages an edit just produced. */
export async function handlePreviewCrash(editor: Editor, frameId: TLShapeId, message: string): Promise<void> {
  const record = getEditRecord(frameId);
  const action = decideOnCrash(record, Date.now(), message);
  if (!record || action === 'ignore') return;
  if (action === 'revert') return revertEdit(editor, record);

  const frame = getFrame(editor, frameId);
  if (!frame) return;
  record.fixAttempted = true;
  record.fixing = true;
  editStatus.set({ phase: 'working', text: 'The new version crashed. Fixing it…' });
  const broken = frame.props.files;
  const response = await postApi<EditResponse>('/api/edit', {
    files: broken,
    segments: [],
    instruction: '',
    runtimeError: message.slice(0, 2000),
  } satisfies EditRequest);
  record.fixing = false;

  const current = getFrame(editor, frameId);
  if (!current || current.props.files !== broken) return; // the user moved on (undo, another edit)
  if (!response.ok) return revertEdit(editor, record);
  // Part of the same edit: ⌘Z still goes straight back to the version before it.
  editor.run(() => editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { files: response.files } }), { history: 'ignore' });
  record.appliedAt = Date.now(); // watch the fixed version too; another crash reverts
  editStatus.set({ phase: 'done', text: 'Fixed a crash in the new version.' });
}

function revertEdit(editor: Editor, record: EditRecord): void {
  forgetEdit(record.frameId);
  if (!getFrame(editor, record.frameId)) return;
  editor.run(
    () => {
      editor.updateShape({ id: record.frameId, type: FRAME_TYPE, props: { files: record.previousFiles } });
      editor.createShapes(record.marks.filter((m) => !editor.getShape(m.id)));
    },
    { history: 'ignore' },
  );
  editStatus.set({ phase: 'error', text: FAILED });
}

/** A small PNG of the mark's ink alone (spec §5.2, with Decision 3). Undefined if export fails. */
async function inkPng(editor: Editor, mark: PlannedMark): Promise<string | undefined> {
  const ids = mark.shapeIds.map((id) => id as TLShapeId);
  const boxes = ids.flatMap((id) => {
    const b = editor.getShapePageBounds(id);
    return b ? [{ x: b.x, y: b.y, w: b.w, h: b.h }] : [];
  });
  if (boxes.length === 0) return undefined;
  const box = unionRects(boxes);
  try {
    const { blob } = await editor.toImage(ids, {
      format: 'png',
      background: true,
      padding: INK_PADDING,
      pixelRatio: 1,
      scale: fitScale(box.w + 2 * INK_PADDING, box.h + 2 * INK_PADDING, INK_MAX_PX, INK_MAX_PX),
    });
    return await blobToBase64(blob);
  } catch {
    return undefined;
  }
}
