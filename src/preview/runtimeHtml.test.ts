import { describe, expect, it } from 'vitest';
import { ALLOWED_PACKAGES, buildRuntimeHtml, safeJsonForScript } from './runtimeHtml';

describe('safeJsonForScript', () => {
  it('escapes < so embedded code cannot close the script tag', () => {
    expect(safeJsonForScript({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}');
  });
});

describe('buildRuntimeHtml', () => {
  it('reports the tagged element map after layout', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toContain("querySelectorAll('[data-src]')");
    expect(html).toContain("type: 'elements'");
    expect(html).toContain('new ResizeObserver(reportLayout)');
  });
  it('embeds modules without breaking out of the script tag', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: 'const s = "</script>";', deps: {} } }, 'App.tsx');
    // Only the three real closing tags: Tailwind, the error guard and the module script.
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    expect(html).toContain('\\u003c/script>');
  });

  it('loads the entry module and the Tailwind browser build', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toContain('load("App.tsx")');
    expect(html).toContain('@tailwindcss/browser@4.3.3');
  });

  it('pins viewport-height utilities to a fixed 800px desktop viewport', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toMatch(/\.min-h-screen\s*\{\s*min-height:\s*800px\s*!important/);
    expect(html).toMatch(/\.h-screen\s*\{\s*height:\s*800px\s*!important/);
  });

  it('installs the error guard before the module script so failed imports are reported', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    const guard = html.indexOf('unhandledrejection');
    const moduleScript = html.indexOf('<script type="module">');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(moduleScript);
    expect(html).toContain("Couldn't load the preview libraries");
    expect(html).toContain('__drawaiReady = true');
  });

  it('allows exactly react, react/jsx-runtime and lucide-react', () => {
    expect([...ALLOWED_PACKAGES].sort()).toEqual(['lucide-react', 'react', 'react/jsx-runtime']);
  });
});
