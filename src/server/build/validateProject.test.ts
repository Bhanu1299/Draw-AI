import { describe, expect, it } from 'vitest';
import { validateProject } from './validateProject';

const OK_APP = 'export default function App() { return <main>Hi</main>; }\n';

describe('validateProject', () => {
  it('accepts a valid project', () => {
    expect(validateProject({ 'App.tsx': OK_APP })).toEqual([]);
  });
  it('rejects unsafe or non-TS paths', () => {
    const errors = validateProject({ 'App.tsx': OK_APP, '../evil.tsx': '', 'styles.css': '' });
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toContain('../evil.tsx');
    expect(errors.join(' ')).toContain('styles.css');
  });
  it('reports compile errors', () => {
    expect(validateProject({})).toEqual(['Missing App.tsx']);
  });
});
