import { describe, expect, it } from 'vitest';
import { resolveImport } from './resolveImport';

const files = {
  'App.tsx': '',
  'components/Header.tsx': '',
  'components/ui/index.tsx': '',
  'lib/utils.ts': '',
};

describe('resolveImport', () => {
  it('resolves a relative import without extension', () => {
    expect(resolveImport('App.tsx', './components/Header', files)).toBe('components/Header.tsx');
  });
  it('resolves a parent-directory import to a .ts file', () => {
    expect(resolveImport('components/Header.tsx', '../lib/utils', files)).toBe('lib/utils.ts');
  });
  it('resolves a directory to its index file', () => {
    expect(resolveImport('App.tsx', './components/ui', files)).toBe('components/ui/index.tsx');
  });
  it('keeps an explicit extension', () => {
    expect(resolveImport('App.tsx', './components/Header.tsx', files)).toBe('components/Header.tsx');
  });
  it('returns null for a missing file', () => {
    expect(resolveImport('App.tsx', './Nope', files)).toBeNull();
  });
  it('returns null for bare package names', () => {
    expect(resolveImport('App.tsx', 'react', files)).toBeNull();
  });
  it('returns null when the path escapes the project root', () => {
    expect(resolveImport('App.tsx', '../outside', files)).toBeNull();
  });
});
