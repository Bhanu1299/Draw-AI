'use client';

import { useState } from 'react';
import { createShapeId, Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { FrameShapeUtil } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import { registerMarkTracking } from '@/marks/markMeta';
import { BuildBar } from './BuildBar';
import { findInterruptedFrames } from './selectionHelpers';

const shapeUtils = [FrameShapeUtil];

function insertSampleFrame(editor: Editor) {
  const view = editor.getViewportPageBounds();
  editor.createShape({
    id: createShapeId(),
    type: FRAME_TYPE,
    x: view.x + 40,
    y: view.y + 40,
    props: { status: 'ready', files: SAMPLE_FILES },
  });
}

/** A frame saved mid-build (tab reloaded or closed) will never finish; say so instead of spinning forever. */
function recoverInterruptedBuilds(editor: Editor) {
  const ids = findInterruptedFrames(editor.getCurrentPageShapes());
  if (ids.length === 0) return;
  editor.run(
    () =>
      editor.updateShapes(
        ids.map((id) => ({
          id,
          type: FRAME_TYPE,
          props: { status: 'error' as const, error: 'This build was interrupted. Select your sketch and click Build again.' },
        })),
      ),
    { history: 'ignore' },
  );
}

export default function Board() {
  const [editor, setEditor] = useState<Editor | null>(null);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawai-board"
        shapeUtils={shapeUtils}
        onMount={(mounted) => {
          recoverInterruptedBuilds(mounted);
          if (mounted.getCurrentPageShapes().length === 0) insertSampleFrame(mounted);
          setEditor(mounted);
          return registerMarkTracking(mounted);
        }}
      />
      {editor && <BuildBar editor={editor} />}
    </div>
  );
}
