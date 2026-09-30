import { describe, expect, it } from 'vitest';
import { applyOps, replaceOnce } from './applyOps';

const HEADER = `export default function Header() {
  return (
    <header>
      <nav className="gap-8">Links</nav>
    </header>
  );
}
`;

describe('replaceOnce', () => {
  it('replaces an exact unique match, keeping $ patterns literal', () => {
    expect(replaceOnce('a $1 b', '$1', '$&$&')).toBe('a $&$& b');
  });
  it('rejects empty, missing and ambiguous quotes', () => {
    expect(replaceOnce('abc', '  ', 'x')).toEqual({ error: expect.stringContaining('empty') });
    expect(replaceOnce('abc', 'zzz', 'x')).toEqual({ error: expect.stringContaining('not found') });
    expect(replaceOnce('ab ab', 'ab', 'x')).toEqual({ error: expect.stringContaining('2 places') });
  });
  it('matches whole lines despite wrong indentation', () => {
    const result = replaceOnce(HEADER, '<nav className="gap-8">Links</nav>\n  </header>', '      <nav className="gap-2">Links</nav>\n    </header>');
    expect(result).toBe(HEADER.replace('gap-8', 'gap-2'));
  });
});

describe('applyOps', () => {
  const files = { 'App.tsx': 'app\n', 'components/Header.tsx': HEADER };
  it('applies edits, writes and deletes', () => {
    const result = applyOps(files, [
      { type: 'edit', path: 'components/Header.tsx', old: 'gap-8', new: 'gap-2' },
      { type: 'write', path: 'components/New.tsx', content: 'new\n' },
      { type: 'delete', path: 'components/Header.tsx' },
    ]);
    expect(result).toEqual({ files: { 'App.tsx': 'app\n', 'components/New.tsx': 'new\n' }, errors: [] });
  });
  it('keeps successful ops and reports failed ones with their path', () => {
    const result = applyOps(files, [
      { type: 'edit', path: 'components/Header.tsx', old: 'gap-8', new: 'gap-2' },
      { type: 'edit', path: 'components/Header.tsx', old: 'missing', new: 'x' },
      { type: 'edit', path: 'components/Nope.tsx', old: 'a', new: 'b' },
      { type: 'delete', path: 'App.tsx' },
    ]);
    expect(result.files['components/Header.tsx']).toContain('gap-2');
    expect(result.errors).toEqual([
      expect.stringMatching(/^components\/Header\.tsx: .*not found/),
      expect.stringMatching(/^components\/Nope\.tsx: .*does not exist/),
      expect.stringMatching(/^App\.tsx: .*can't be deleted/),
    ]);
    expect(files['components/Header.tsx']).toContain('gap-8');
  });
});
