export interface CompiledModule {
  code: string;
  /** Relative import specifier → resolved project path. */
  deps: Record<string, string>;
}

export const PREVIEW_SOURCE = 'drawai-preview';

const REACT = 'react@19.3.0';
const EXTERNAL_URLS: Record<string, string> = {
  react: `https://esm.sh/${REACT}`,
  'react/jsx-runtime': `https://esm.sh/${REACT}/jsx-runtime`,
  'lucide-react': `https://esm.sh/lucide-react@1.48.0?deps=${REACT}`,
};
const REACT_DOM_CLIENT_URL = `https://esm.sh/react-dom@19.3.0/client?deps=${REACT}`;
const TAILWIND_URL = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3';

export const ALLOWED_PACKAGES = Object.keys(EXTERNAL_URLS);

/** JSON that is safe to inline inside a <script> element. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Build the iframe srcdoc: loads externals from esm.sh, runs our CommonJS modules, renders App. */
export function buildRuntimeHtml(modules: Record<string, CompiledModule>, entry: string): string {
  const names = Object.keys(EXTERNAL_URLS);
  const externalImports = names
    .map((name, i) => `import * as ext${i} from ${JSON.stringify(EXTERNAL_URLS[name])};`)
    .join('\n');
  const externalMap = names.map((name, i) => `${JSON.stringify(name)}: ext${i}`).join(', ');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<script src="${TAILWIND_URL}"></script>
<style>html,body{margin:0;background:#fff}</style>
</head><body><div id="root"></div>
<script type="module">
${externalImports}
import { createRoot } from ${JSON.stringify(REACT_DOM_CLIENT_URL)};
const externals = { ${externalMap} };
const modules = ${safeJsonForScript(modules)};
const cache = {};
const report = (msg) => parent.postMessage({ source: ${JSON.stringify(PREVIEW_SOURCE)}, ...msg }, '*');
window.addEventListener('error', (e) => report({ type: 'runtime-error', message: String(e.message) }));
function load(path) {
  if (cache[path]) return cache[path].exports;
  const mod = modules[path];
  if (!mod) throw new Error('Module not found: ' + path);
  const module = { exports: {} };
  cache[path] = module;
  const require = (spec) => {
    if (spec in externals) return externals[spec];
    if (!(spec in mod.deps)) throw new Error('Cannot resolve "' + spec + '" from ' + path);
    return load(mod.deps[spec]);
  };
  new Function('require', 'module', 'exports', mod.code)(require, module, module.exports);
  return module.exports;
}
try {
  const App = load(${JSON.stringify(entry)}).default;
  createRoot(document.getElementById('root')).render(externals.react.createElement(App));
  new ResizeObserver(() => report({ type: 'height', height: document.documentElement.scrollHeight })).observe(document.body);
} catch (err) {
  report({ type: 'runtime-error', message: String(err && err.message ? err.message : err) });
}
</script></body></html>`;
}
