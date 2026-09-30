'use client';

import { useEditor, useValue } from 'tldraw';
import type { Rect } from '@/shared/geometry';
import { useEditPlan } from './useEditPlan';

const BLUE = '#2563eb';
const AMBER = '#f59e0b';

/** Numbered badges on each mark and outlines on what it hit. Screen-space, so they stay readable at any zoom. */
export function MarkOverlay() {
  const editor = useEditor();
  const result = useEditPlan(editor);
  // Re-render on pan/zoom so everything stays pinned to its mark.
  useValue('camera', () => editor.getCamera(), [editor]);
  if (!result.ok) return null;

  const toScreen = (r: Rect) => {
    const a = editor.pageToViewport({ x: r.x, y: r.y });
    const b = editor.pageToViewport({ x: r.x + r.w, y: r.y + r.h });
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {result.plan.marks.flatMap((mark) =>
        mark.hit.highlights.map((r, i) => (
          <div
            key={`${mark.n}-${i}`}
            style={{
              position: 'absolute',
              ...toScreen(r),
              outline: `2px ${mark.hit.target.kind === 'region' ? 'dashed' : 'solid'} ${mark.hit.unsure ? AMBER : BLUE}`,
              background: mark.hit.unsure ? 'rgba(245,158,11,0.08)' : 'rgba(37,99,235,0.08)',
              borderRadius: 4,
            }}
          />
        )),
      )}
      {result.plan.marks.map((mark) => {
        const p = editor.pageToViewport({ x: mark.bounds.x, y: mark.bounds.y });
        return (
          <div
            key={mark.n}
            style={{
              position: 'absolute',
              left: p.x - 12,
              top: p.y - 12,
              minWidth: 24,
              height: 24,
              padding: '0 6px',
              borderRadius: 12,
              background: mark.hit.unsure ? AMBER : BLUE,
              color: '#fff',
              font: '600 13px/24px system-ui, sans-serif',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }}
          >
            {mark.hit.unsure ? `${mark.n}?` : mark.n}
          </div>
        );
      })}
    </div>
  );
}
