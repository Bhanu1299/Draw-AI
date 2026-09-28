import { describe, expect, it } from 'vitest';
import { parseFiles, parseSummary } from './parseFiles';

describe('parseFiles', () => {
  it('extracts files and normalises ./ paths', () => {
    const text = '<file path="App.tsx">\nexport default 1;\n</file>\n<file path="./components/Hero.tsx">\nconst x = 2;\n</file>';
    expect(parseFiles(text)).toEqual({
      'App.tsx': 'export default 1;\n',
      'components/Hero.tsx': 'const x = 2;\n',
    });
  });

  it('strips markdown fences inside a file block', () => {
    const text = '<file path="App.tsx">\n```tsx\nexport default 1;\n```\n</file>';
    expect(parseFiles(text)['App.tsx']).toBe('export default 1;\n');
  });

  it('returns an empty object when there are no file blocks', () => {
    expect(parseFiles('Sorry, I cannot help.')).toEqual({});
  });
});

describe('parseSummary', () => {
  it('reads the summary line', () => {
    expect(parseSummary('<file path="App.tsx">x</file>\n<summary> A landing page </summary>')).toBe('A landing page');
  });
  it('returns null when missing', () => {
    expect(parseSummary('no summary')).toBeNull();
  });
});
