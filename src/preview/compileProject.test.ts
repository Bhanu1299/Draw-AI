import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import { compileProject } from './compileProject';

const APP = 'import Header from "./components/Header";\nexport default function App() { return <main><Header /></main>; }\n';
const HEADER = 'export default function Header() { return <nav className="p-4">Hi</nav>; }\n';

describe('compileProject', () => {
  it('compiles a multi-file project and records resolved dependencies', () => {
    const result = compileProject({ 'App.tsx': APP, 'components/Header.tsx': HEADER }, { tagSources: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.html).toContain('"./components/Header":"components/Header.tsx"');
  });

  it('adds data-src tags when asked', () => {
    const result = compileProject({ 'App.tsx': APP, 'components/Header.tsx': HEADER }, { tagSources: true });
    expect(result.ok && result.html.includes('components/Header.tsx:1:')).toBe(true);
  });

  it('fails without App.tsx', () => {
    expect(compileProject({ 'components/Header.tsx': HEADER }, { tagSources: false })).toEqual({
      ok: false,
      error: 'Missing App.tsx',
    });
  });

  it('rejects packages the preview does not serve, naming them', () => {
    const app = 'import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }\n';
    const result = compileProject({ 'App.tsx': app }, { tagSources: false });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('framer-motion');
  });

  it('rejects a relative import to a missing file', () => {
    const result = compileProject({ 'App.tsx': APP }, { tagSources: false });
    expect(!result.ok && result.error).toContain('./components/Header');
  });

  it('reports syntax errors with the file name', () => {
    const result = compileProject({ 'App.tsx': 'export default function App() { return <div> }' }, { tagSources: false });
    expect(!result.ok && result.error).toMatch(/^App\.tsx/);
  });

  it('compiles the bundled sample project', () => {
    expect(compileProject(SAMPLE_FILES, { tagSources: true }).ok).toBe(true);
  });
});
