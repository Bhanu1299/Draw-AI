import { describe, expect, it } from 'vitest';
import { validateProject } from './validateProject';

const OK_APP = 'export default function App() { return <main>Hi</main>; }\n';

describe('validateProject', () => {
  it('accepts a valid project', () => {
    expect(validateProject({ 'App.tsx': OK_APP })).toEqual({ ok: true, files: { 'App.tsx': OK_APP } });
  });
  it('drops stray files nothing imports, even broken or oddly named ones', () => {
    const result = validateProject({
      'App.tsx': OK_APP,
      '../evil.tsx': '',
      'styles.css': 'body{}',
      'components/Broken.tsx': 'export default function B() { return <div> }',
    });
    expect(result).toEqual({ ok: true, files: { 'App.tsx': OK_APP } });
  });
  it('rejects an imported file that is not TypeScript', () => {
    const app = 'import "./styles.css";\n' + OK_APP;
    const result = validateProject({ 'App.tsx': app, 'styles.css': 'body{}' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('styles.css');
  });
  it('rejects icons lucide-react does not have', () => {
    const app = 'import { Github } from "lucide-react";\nexport default function App() { return <Github />; }\n';
    const result = validateProject({ 'App.tsx': app });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('"Github"');
  });
  it('reports compile errors', () => {
    expect(validateProject({})).toEqual({ ok: false, errors: ['Missing App.tsx'] });
  });
});
