import { DATA_SRC_ATTR } from './dataSrcPlugin';

export interface CompiledModule {
  code: string;
  /** Relative import specifier → resolved project path. */
  deps: Record<string, string>;
}

export const PREVIEW_SOURCE = 'drawai-preview';

const REACT = 'react@19.3.0';
/** Must match the lucide-react in package.json: the server checks icon names against it. */
export const LUCIDE_VERSION = '1.48.0';
const EXTERNAL_URLS: Record<string, string> = {
  react: `https://esm.sh/${REACT}`,
  'react/jsx-runtime': `https://esm.sh/${REACT}/jsx-runtime`,
  'lucide-react': `https://esm.sh/lucide-react@${LUCIDE_VERSION}?deps=${REACT}`,
};
const REACT_DOM_CLIENT_URL = `https://esm.sh/react-dom@19.3.0/client?deps=${REACT}`;
const TAILWIND_URL = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3';

export const ALLOWED_PACKAGES = Object.keys(EXTERNAL_URLS);

/** Height of the virtual desktop viewport that vh-based utilities resolve to. */
export const VIRTUAL_VIEWPORT_HEIGHT = 800;
const READY_TIMEOUT_MS = 15000;
export const LIBS_FAILED_MESSAGE = "Couldn't load the preview libraries. Check your internet connection and reload.";

// The iframe's real viewport is the frame's height, which follows the content. Anything sized in vh would
// then feed back into the height it reports and grow without limit, so pin the screen utilities to a fixed
// desktop viewport. Loaded with !important because Tailwind's browser build injects its styles after ours.
const VIEWPORT_PIN_CSS = ['h', 'min-h', 'max-h']
  .map((prefix) => {
    const property = { h: 'height', 'min-h': 'min-height', 'max-h': 'max-height' }[prefix];
    return ['screen', 'dvh', 'svh', 'lvh']
      .map((unit) => `.${prefix}-${unit} { ${property}: ${VIRTUAL_VIEWPORT_HEIGHT}px !important; }`)
      .join('\n');
  })
  .join('\n');

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
<style>
html,body{margin:0;background:#fff}
${VIEWPORT_PIN_CSS}
</style>
<script>
// Classic script: runs even when the module script's imports fail to load.
window.__drawaiReport = (msg) => parent.postMessage({ source: ${JSON.stringify(PREVIEW_SOURCE)}, ...msg }, '*');
window.addEventListener('error', (e) => {
  if (e instanceof ErrorEvent) window.__drawaiReport({ type: 'runtime-error', message: String(e.message) });
  else if (e.target && e.target.tagName === 'SCRIPT') window.__drawaiReport({ type: 'runtime-error', message: ${JSON.stringify(LIBS_FAILED_MESSAGE)} });
}, true);
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason && e.reason.message ? e.reason.message : e.reason;
  window.__drawaiReport({ type: 'runtime-error', message: String(reason) });
});
// Interact mode: clicks stay on this page, and the board's I / Escape still work when the page has focus.
document.addEventListener('click', (e) => {
  const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (link && !link.getAttribute('href').startsWith('#')) e.preventDefault();
}, true);
document.addEventListener('submit', (e) => e.preventDefault(), true);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (typing || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.key === 'i' || e.key === 'I') window.__drawaiReport({ type: 'key', key: 'i' });
  else if (e.key === 'Escape') window.__drawaiReport({ type: 'key', key: 'Escape' });
});
setTimeout(() => {
  if (!window.__drawaiReady) window.__drawaiReport({ type: 'runtime-error', message: ${JSON.stringify(LIBS_FAILED_MESSAGE)} });
}, ${READY_TIMEOUT_MS});
</script>
</head><body><div id="root"></div>
<script type="module">
${externalImports}
import { createRoot } from ${JSON.stringify(REACT_DOM_CLIENT_URL)};
const externals = { ${externalMap} };
const modules = ${safeJsonForScript(modules)};
const cache = {};
const report = window.__drawaiReport;
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
function collectElements() {
  const nodes = Array.from(document.querySelectorAll('[${DATA_SRC_ATTR}]'));
  const index = new Map(nodes.map((node, i) => [node, i]));
  return nodes.map((node) => {
    const r = node.getBoundingClientRect();
    let parent = node.parentElement;
    while (parent && !index.has(parent)) parent = parent.parentElement;
    const label = node.innerText || node.getAttribute('alt') || node.getAttribute('placeholder') || node.getAttribute('aria-label') || '';
    return {
      src: node.getAttribute('${DATA_SRC_ATTR}'),
      tag: node.tagName.toLowerCase(),
      text: label.replace(/\\s+/g, ' ').trim().slice(0, 60),
      rect: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height },
      parent: parent ? index.get(parent) : -1,
    };
  });
}
let elementsTimer;
function reportLayout() {
  report({ type: 'height', height: document.documentElement.scrollHeight });
  // Element rects drive hit-testing: let layout settle (images, fonts) before measuring.
  clearTimeout(elementsTimer);
  elementsTimer = setTimeout(() => report({ type: 'elements', elements: collectElements() }), 150);
}
// DOM mutations are throttled, not debounced: a busy page (clock, ticker) still gets a report every 500 ms,
// and each report posts height once, however many mutations it covers.
let mutationTimer = 0;
function scheduleLayout() {
  if (mutationTimer) return;
  mutationTimer = setTimeout(() => {
    mutationTimer = 0;
    reportLayout();
  }, 500);
}
try {
  const App = load(${JSON.stringify(entry)}).default;
  createRoot(document.getElementById('root')).render(externals.react.createElement(App));
  window.__drawaiReady = true;
  new ResizeObserver(reportLayout).observe(document.body);
  // Clicks in interact mode can open menus or tabs without resizing the page: re-measure after DOM changes.
  new MutationObserver(scheduleLayout).observe(document.getElementById('root'), { subtree: true, childList: true, characterData: true });
} catch (err) {
  report({ type: 'runtime-error', message: String(err && err.message ? err.message : err) });
}
</script></body></html>`;
}
