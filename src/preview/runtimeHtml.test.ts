import { describe, expect, it } from 'vitest';
import { ALLOWED_PACKAGES, buildRuntimeHtml, safeJsonForScript } from './runtimeHtml';

describe('safeJsonForScript', () => {
  it('escapes < so embedded code cannot close the script tag', () => {
    expect(safeJsonForScript({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}');
  });
});

describe('buildRuntimeHtml', () => {
  it('embeds modules without breaking out of the script tag', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: 'const s = "</script>";', deps: {} } }, 'App.tsx');
    // Only the two real closing tags: the Tailwind script and the module script.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain('\\u003c/script>');
  });

  it('loads the entry module and the Tailwind browser build', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toContain('load("App.tsx")');
    expect(html).toContain('@tailwindcss/browser@4.3.3');
  });

  it('allows exactly react, react/jsx-runtime and lucide-react', () => {
    expect([...ALLOWED_PACKAGES].sort()).toEqual(['lucide-react', 'react', 'react/jsx-runtime']);
  });
});
