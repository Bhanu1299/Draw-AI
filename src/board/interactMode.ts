import { atom, react, type Editor } from 'tldraw';
import { interactKeyAction } from './interactKeys';

/** Interact mode: pages take clicks (links, buttons, menus) and ink is off. Draw mode is the default. */
export const interactMode = atom<boolean>('interact mode', false);

export function setInteractMode(editor: Editor, on: boolean): void {
  if (interactMode.get() === on) return;
  interactMode.set(on);
  if (on) {
    editor.setCurrentTool('select');
  } else if (document.activeElement instanceof HTMLIFrameElement) {
    // Focus stayed in the page after a click: give the keyboard back to the board.
    document.activeElement.blur();
    editor.focus();
  }
}

/** A key the preview forwarded because it had focus. */
export function applyInteractKey(editor: Editor, key: 'i' | 'Escape'): void {
  setInteractMode(editor, key === 'i' ? !interactMode.get() : false);
}

export function registerInteractMode(editor: Editor): () => void {
  const onKey = (e: KeyboardEvent) => {
    const action = interactKeyAction(e, isTyping(editor, e.target), interactMode.get());
    if (action) setInteractMode(editor, action === 'toggle' ? !interactMode.get() : false);
  };
  window.addEventListener('keydown', onKey);
  // Picking a drawing tool means the user wants ink again.
  const stop = react('leave interact mode for ink', () => {
    const tool = editor.getCurrentToolId();
    if (interactMode.get() && tool !== 'select' && tool !== 'hand') interactMode.set(false);
  });
  return () => {
    window.removeEventListener('keydown', onKey);
    stop();
  };
}

function isTyping(editor: Editor, target: EventTarget | null): boolean {
  if (editor.getEditingShapeId() !== null) return true;
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
