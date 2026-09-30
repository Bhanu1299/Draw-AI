import { describe, expect, it } from 'vitest';
import { interactKeyAction, type KeyLike } from './interactKeys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, repeat: false, ...mods });

describe('interactKeyAction', () => {
  it('toggles on I and leaves on Escape', () => {
    expect(interactKeyAction(key('i'), false, false)).toBe('toggle');
    expect(interactKeyAction(key('I'), false, true)).toBe('toggle');
    expect(interactKeyAction(key('Escape'), false, true)).toBe('exit');
    expect(interactKeyAction(key('Escape'), false, false)).toBeNull();
  });
  it('ignores I while typing, with modifiers (⌘I is italic) or on key repeat', () => {
    expect(interactKeyAction(key('i'), true, false)).toBeNull();
    expect(interactKeyAction(key('i', { metaKey: true }), false, false)).toBeNull();
    expect(interactKeyAction(key('i', { repeat: true }), false, false)).toBeNull();
  });
});
