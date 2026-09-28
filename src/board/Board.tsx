'use client';

import { createShapeId, Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { FrameShapeUtil } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { SAMPLE_FILES } from '@/frame/sampleFiles';

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

export default function Board() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="drawai-board"
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          if (editor.getCurrentPageShapes().length === 0) insertSampleFrame(editor);
        }}
      />
    </div>
  );
}
