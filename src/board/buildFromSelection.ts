import { createShapeId, type Editor } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { checkSelection, fitScale, MAX_EXPORT_H, MAX_EXPORT_W } from './selectionHelpers';

const FRAME_GAP = 120;

/** Export the selection as PNG, place a "building" frame beside it, and fill it with the built page. */
export async function buildFromSelection(
  editor: Editor,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const shapes = editor.getSelectedShapes();
  const check = checkSelection(shapes);
  if (!check.ok) return check;
  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return { ok: false, error: 'Select a sketch or a screenshot first.' };

  const { blob } = await editor.toImage(
    shapes.map((s) => s.id),
    { format: 'png', background: true, padding: 16, scale: fitScale(bounds.w, bounds.h, MAX_EXPORT_W, MAX_EXPORT_H) },
  );
  const imageBase64 = await blobToBase64(blob);

  const frameId = createShapeId();
  editor.createShape({
    id: frameId,
    type: FRAME_TYPE,
    x: bounds.maxX + FRAME_GAP,
    y: bounds.minY,
    props: { status: 'building' },
  });

  const response = await postBuild({ kind: check.kind, imageBase64, note });
  if (response.ok) {
    editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { status: 'ready', files: response.files, error: '' } });
    return { ok: true };
  }
  editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { status: 'error', error: response.error } });
  return { ok: false, error: response.error };
}

async function postBuild(body: BuildRequest): Promise<BuildResponse> {
  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as BuildResponse;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check that it is running and try again.' };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
