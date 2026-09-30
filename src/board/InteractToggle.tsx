'use client';

import { useValue, type Editor } from 'tldraw';
import { interactMode, setInteractMode } from './interactMode';

/** Shows the mode and switches it; the I key does the same. */
export function InteractToggle({ editor }: { editor: Editor }) {
  const on = useValue(interactMode);
  return (
    <button
      onClick={() => setInteractMode(editor, !on)}
      aria-pressed={on}
      style={{
        position: 'absolute',
        top: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        padding: '4px 12px',
        borderRadius: 999,
        border: '1px solid #e4e4e7',
        background: on ? '#2563eb' : '#fff',
        color: on ? '#fff' : '#52525b',
        font: '13px system-ui, sans-serif',
        cursor: 'pointer',
      }}
    >
      {on ? 'Interact mode: clicks go to the page · press I to draw' : 'Draw mode · press I to click inside the page'}
    </button>
  );
}
