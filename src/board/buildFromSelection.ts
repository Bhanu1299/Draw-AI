import { createShapeId, type Editor } from 'tldraw';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { MAX_IMAGE_BYTES } from '@/server/build/parseBuildRequest';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { finishBuild, startBuild } from './buildTracker';
import { checkSelection, EXPORT_PADDING, exportScale, sliceRects } from './selectionHelpers';

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

  // pixelRatio 1: tldraw defaults PNG exports to 2x, which doubles the size without helping the model.
  const { blob } = await editor.toImage(
    shapes.map((s) => s.id),
    { format: 'png', background: true, padding: EXPORT_PADDING, pixelRatio: 1, scale: exportScale(bounds.w, bounds.h) },
  );
  const images = await sliceToBase64(blob);
  if (!images) {
    return { ok: false, error: 'This selection is too large to send (max 5 MB per slice). Select less, or crop the screenshot.' };
  }

  const frameId = createShapeId();
  // Own undo step for the new frame, so undoing a stroke drawn during the build doesn't also revert the result.
  editor.markHistoryStoppingPoint('build');
  startBuild(frameId);
  editor.createShape({
    id: frameId,
    type: FRAME_TYPE,
    x: bounds.maxX + FRAME_GAP,
    y: bounds.minY,
    props: { status: 'building' },
  });

  const response = await postBuild({ kind: check.kind, images, note }).finally(() => finishBuild(frameId));
  if (!editor.getShape(frameId)) {
    return { ok: false, error: 'The page was built, but its frame was removed (undo or delete) before it finished.' };
  }
  // The result lands in the frame's own history step, not in whatever the user drew while waiting.
  editor.run(
    () =>
      editor.updateShape({
        id: frameId,
        type: FRAME_TYPE,
        props: response.ok
          ? { status: 'ready', files: response.files, error: '' }
          : { status: 'error', error: response.error },
      }),
    { history: 'ignore' },
  );
  return response.ok ? { ok: true } : { ok: false, error: response.error };
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

/** Cut a tall PNG into top-to-bottom slices so the model sees each part at a legible size. Null if a slice is too big. */
async function sliceToBase64(blob: Blob): Promise<string[] | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const rects = sliceRects(bitmap.width, bitmap.height);
    if (rects.length === 1) return blob.size > MAX_IMAGE_BYTES ? null : [await blobToBase64(blob)];
    const slices: string[] = [];
    for (const rect of rects) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = rect.h;
      canvas.getContext('2d')?.drawImage(bitmap, 0, rect.y, bitmap.width, rect.h, 0, 0, bitmap.width, rect.h);
      const part = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not slice the image'))), 'image/png'),
      );
      if (part.size > MAX_IMAGE_BYTES) return null;
      slices.push(await blobToBase64(part));
    }
    return slices;
  } finally {
    bitmap.close();
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
