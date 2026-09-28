'use client';

import { useState } from 'react';
import { useValue, type Editor } from 'tldraw';
import { buildFromSelection } from './buildFromSelection';

export function BuildBar({ editor }: { editor: Editor }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasSelection = useValue('has selection', () => editor.getSelectedShapeIds().length > 0, [editor]);

  async function onBuild() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await buildFromSelection(editor, note);
      if (result.ok) setNote('');
      else setMessage(result.error);
    } catch {
      setMessage('Something went wrong while exporting your selection. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        font: '14px system-ui, sans-serif',
      }}
    >
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note, e.g. dark theme, SaaS landing page"
        maxLength={2000}
        style={{ width: 320, padding: '8px 10px', border: '1px solid #d4d4d8', borderRadius: 8 }}
      />
      <button
        onClick={onBuild}
        disabled={!hasSelection || busy}
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          border: 0,
          background: !hasSelection || busy ? '#a1a1aa' : '#18181b',
          color: '#fff',
          cursor: !hasSelection || busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Building…' : 'Build from selection'}
      </button>
      {message && (
        <span role="alert" style={{ color: '#b91c1c', maxWidth: 360 }}>
          {message}
        </span>
      )}
    </div>
  );
}
