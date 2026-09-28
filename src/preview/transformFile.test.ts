import { describe, expect, it } from 'vitest';
import { transformFile } from './transformFile';

const HEADER = [
  'import Logo from "./Logo";',
  'export default function Header(): JSX.Element {',
  '  return (',
  '    <nav className="p-4">',
  '      <a href="/">Home</a>',
  '      <Logo />',
  '    </nav>',
  '  );',
  '}',
].join('\n');

describe('transformFile', () => {
  it('compiles TSX to CommonJS with the automatic JSX runtime', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: false });
    expect(code).toContain('require("react/jsx-runtime")');
    expect(code).toContain('require("./Logo")');
    expect(code).not.toContain('<nav');
  });

  it('tags HTML-level elements with data-src path:line:column', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: true });
    expect(code).toContain('"data-src": "components/Header.tsx:4:5"');
    expect(code).toContain('"data-src": "components/Header.tsx:5:7"');
  });

  it('does not tag components (capitalised JSX)', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: true });
    expect(code.match(/"data-src"/g)).toHaveLength(2);
  });

  it('adds no tags when tagSources is false', () => {
    const code = transformFile('components/Header.tsx', HEADER, { tagSources: false });
    expect(code).not.toContain('data-src');
  });

  it('throws a message naming the file on a syntax error', () => {
    expect(() =>
      transformFile('Bad.tsx', 'export default function A() { return <div> }', { tagSources: false }),
    ).toThrow(/Bad\.tsx/);
  });
});
