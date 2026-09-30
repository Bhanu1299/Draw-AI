'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor } from 'tldraw';
import { isBuildInFlight } from '@/board/buildTracker';
import { parsePreviewMessage } from '@/preview/previewMessages';
import { setFrameElements } from './elementRegistry';
import { nextFrameHeight } from './frameHeight';
import type { FrameShape } from './FrameShapeUtil';
import { FRAME_TYPE } from './frameTypes';

export function FramePreview({ shape }: { shape: FrameShape }) {
  const editor = useEditor();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { files, status, error } = shape.props;

  // Compile whenever the files change. Babel is loaded on demand.
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    import('@/preview/compileProject').then(({ compileProject }) => {
      if (cancelled) return;
      const result = compileProject(files, { tagSources: true });
      setHtml(result.ok ? result.html : null);
      setProblem(result.ok ? null : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [files, status]);

  // Listen to this frame's iframe only: resize to content, surface runtime errors.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = parsePreviewMessage(event.data);
      if (!msg) return;
      if (msg.type === 'elements') {
        setFrameElements(shape.id, msg.elements);
        return;
      }
      if (msg.type === 'runtime-error') {
        setProblem(msg.message);
        return;
      }
      const current = editor.getShape(shape.id) as FrameShape | undefined;
      const height = current ? nextFrameHeight(current.props.h, msg.height) : null;
      if (height === null) return;
      // Auto-resizing is not a user action: keep it out of undo history.
      editor.run(() => editor.updateShape({ id: shape.id, type: FRAME_TYPE, props: { h: height } }), {
        history: 'ignore',
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [editor, shape.id]);

  if (status === 'building') {
    // Not running in this tab: the page was reloaded, an undo/redo brought the frame back, or another tab started it.
    if (!isBuildInFlight(shape.id)) {
      return <Centered tone="error">This build was interrupted. Select your sketch and click Build again.</Centered>;
    }
    return <Centered>Building your page…</Centered>;
  }
  if (status === 'error') return <Centered tone="error">{error}</Centered>;

  return (
    <>
      {html && (
        <iframe
          ref={iframeRef}
          title="Page preview"
          sandbox="allow-scripts"
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 0, display: 'block', pointerEvents: 'none' }}
        />
      )}
      {problem && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px 16px',
            background: '#fef2f2',
            color: '#991b1b',
            font: '14px/1.4 system-ui, sans-serif',
            borderTop: '1px solid #fecaca',
          }}
        >
          {problem}
        </div>
      )}
    </>
  );
}

function Centered({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        font: '20px/1.4 system-ui, sans-serif',
        color: tone === 'error' ? '#b91c1c' : '#52525b',
      }}
    >
      {children}
    </div>
  );
}
