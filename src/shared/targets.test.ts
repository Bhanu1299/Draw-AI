import { describe, expect, it } from 'vitest';
import { parseSrc, targetElements } from './targets';

const nav = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Links' };
const hero = { src: 'components/Hero.tsx:5:5', tag: 'section', text: '' };

describe('targets', () => {
  it('parses a data-src tag', () => {
    expect(parseSrc('components/Header.tsx:18:4')).toEqual({ path: 'components/Header.tsx', line: 18 });
    expect(parseSrc('nonsense')).toBeNull();
  });
  it('lists the elements a target refers to', () => {
    expect(targetElements({ kind: 'elements', elements: [nav] })).toEqual([nav]);
    const region = {
      width: 100, height: 50, left: 0, top: 0, fullWidth: false, outside: null,
      inside: hero, elementAbove: null, elementBelow: nav, covers: [],
    };
    expect(targetElements({ kind: 'region', region })).toEqual([hero, nav]);
  });
});
