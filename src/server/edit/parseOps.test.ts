import { describe, expect, it } from 'vitest';
import { parseOps } from './parseOps';

describe('parseOps', () => {
  it('reads edit, file and delete blocks in order', () => {
    const text = `<edit path="./components/Header.tsx">
<old>
      <nav className="flex gap-8 text-sm">
</old>
<new>
      <nav className="flex gap-4 text-xs">
</new>
</edit>
<file path="components/Quote.tsx">
export default function Quote() { return <p>Hi</p>; }
</file>
<delete path="components/Old.tsx"/>
<summary>Smaller nav.</summary>`;
    expect(parseOps(text)).toEqual([
      { type: 'edit', path: 'components/Header.tsx', old: '      <nav className="flex gap-8 text-sm">', new: '      <nav className="flex gap-4 text-xs">' },
      { type: 'write', path: 'components/Quote.tsx', content: 'export default function Quote() { return <p>Hi</p>; }\n' },
      { type: 'delete', path: 'components/Old.tsx' },
    ]);
  });
  it('keeps inner whitespace of one-line blocks', () => {
    expect(parseOps('<edit path="App.tsx"><old>a  b</old><new> c </new></edit>')).toEqual([
      { type: 'edit', path: 'App.tsx', old: 'a  b', new: ' c ' },
    ]);
  });
  it('returns nothing for prose', () => {
    expect(parseOps('I would change the header.')).toEqual([]);
  });
});
