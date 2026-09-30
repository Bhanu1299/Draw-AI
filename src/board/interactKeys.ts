export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** `I` toggles interact mode and Escape leaves it, unless the user is typing somewhere. */
export function interactKeyAction(e: KeyLike, typing: boolean, on: boolean): 'toggle' | 'exit' | null {
  if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'i' || e.key === 'I') return 'toggle';
  if (e.key === 'Escape' && on) return 'exit';
  return null;
}
