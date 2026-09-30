import { ENTRY_FILE } from '@/preview/compileProject';
import type { ChatPart } from '@/server/ai/chat';
import { CODE_RULES } from '@/server/build/prompt';
import { parseSrc, targetElements } from '@/shared/targets';
import type { EditRequest, Gesture, MarkTarget, ProjectFiles, Segment, TargetElement } from '@/shared/types';

/** ~40k tokens: above this, whole-project prompts get slow and expensive (spec §6.1). */
export const MAX_WHOLE_PROJECT_CHARS = 160_000;

export const EDIT_SYSTEM_PROMPT = `You edit a web page built with React and Tailwind CSS. The user drew marks on the live page and typed an instruction.

How to read the marks:
- Marks are numbered 1, 2, 3… The instruction may refer to them as "1", "#1" or "①".
- CIRCLED: these elements. POINTED AT: this element. CROSSED OUT: remove or replace these. UNDERLINED: this text.
- FROM … TO …: move or connect the first element to where the arrow points.
- SKETCHED new UI: add new UI in that region. Boxes are layout regions and written words are labels or content. An ink image, when attached, shows the drawing.
- "unsure" means the mark didn't land cleanly on an element: judge from its position and the ink image.
- Element references look like <tag> "text" at path:line → the opening line of that element's JSX.

Change only what the marks and the instruction ask for, and keep everything else exactly as it is, unless the instruction is about the whole page.

Output format (follow exactly):
- To change a file: <edit path="PATH"><old>exact existing code</old><new>replacement code</new></edit>. Copy <old> exactly from the current file; it must match exactly one place, so include a few surrounding lines when needed.
- To create a file or rewrite a whole file: <file path="PATH">full contents</file>.
- To delete a file: <delete path="PATH"/>.
- After the changes, write one line: <summary>one short sentence describing the change</summary>.
- Write nothing else: no markdown fences, no explanations.

Code rules:
${CODE_RULES}
- Never write data-src attributes.`;

const LABEL: Record<Gesture, string> = {
  circle: 'CIRCLED',
  arrow: 'POINTED AT',
  'cross-out': 'CROSSED OUT',
  underline: 'UNDERLINED',
  sketch: 'SKETCHED new UI',
};

export type EditPrompt = { ok: true; content: ChatPart[] } | { ok: false; error: string };

/** Compile the numbered marks, the instruction and only the relevant files into one compact message. */
export function compileEditPrompt(req: EditRequest): EditPrompt {
  const paths = Object.keys(req.files).sort((a, b) => (a === ENTRY_FILE ? -1 : b === ENTRY_FILE ? 1 : a.localeCompare(b)));
  const shown = filesToShow(req, paths);
  if (!shown) return { ok: false, error: 'This page is too big to change all at once. Point at the part you want to change.' };

  const lines = [`Project files: ${paths.join(', ')}`, ''];
  if (req.runtimeError) {
    lines.push('After your last change the page crashes in the browser with this error:', req.runtimeError, '');
    lines.push('Fix the code so the page renders again. Change as little as possible.');
  } else {
    if (req.segments.length > 0) lines.push('Marks:', ...req.segments.flatMap((s) => describeSegment(s, req.files)), '');
    lines.push(`Instruction: ${req.instruction.trim() || '(none: follow the marks)'}`);
  }
  lines.push('');
  for (const path of paths) {
    if (shown.has(path)) lines.push(`--- ${path} ---`, req.files[path].replace(/\n$/, ''), `--- end of ${path} ---`, '');
  }
  const hidden = paths.filter((p) => !shown.has(p));
  if (hidden.length > 0) lines.push(`Other files (not shown, leave them unless the change needs them): ${hidden.join(', ')}`);

  const images = req.segments.flatMap((s): ChatPart[] =>
    s.inkPng ? [{ type: 'text', text: `Ink image for mark ${s.n}:` }, { type: 'image', pngBase64: s.inkPng }] : [],
  );
  return { ok: true, content: [...images, { type: 'text', text: lines.join('\n').trimEnd() }] };
}

/**
 * Small projects go in whole: the instruction may be global ("make it all more premium") even with marks,
 * and a model that can't see a file may overwrite it blindly. Big ones get App.tsx plus the marked files.
 */
function filesToShow(req: EditRequest, paths: string[]): Set<string> | null {
  const total = paths.reduce((n, p) => n + req.files[p].length, 0);
  if (total <= MAX_WHOLE_PROJECT_CHARS) return new Set(paths);
  if (req.runtimeError || req.segments.length === 0) return null;
  const shown = new Set([ENTRY_FILE]);
  for (const s of req.segments) {
    const targets = s.pointsTo ? [s.target, s.pointsTo] : [s.target];
    for (const e of targets.flatMap(targetElements)) {
      const path = parseSrc(e.src)?.path;
      if (path && path in req.files) shown.add(path);
    }
  }
  return shown;
}

function describeSegment(s: Segment, files: ProjectFiles): string[] {
  const head = `${s.n}. ${LABEL[s.gesture]}${s.unsure ? ' (unsure)' : ''}`;
  const out = s.pointsTo
    ? [`${head}, FROM:`, ...describeTarget(s.target, files), '   TO:', ...describeTarget(s.pointsTo, files)]
    : [`${head}:`, ...describeTarget(s.target, files)];
  if (s.wrote.length > 0) out.push(`   wrote: ${s.wrote.map((w) => JSON.stringify(w)).join(', ')}`);
  if (s.inkPng) out.push(`   (ink image ${s.n} attached)`);
  return out;
}

function describeTarget(t: MarkTarget, files: ProjectFiles): string[] {
  if (t.kind === 'elements') return t.elements.map((e) => `   ${describeElement(e, files)}`);
  const r = t.region;
  const where = r.outside
    ? r.outside === 'left' || r.outside === 'right'
      ? `to the ${r.outside} of the page`
      : r.outside === 'above'
        ? 'above the page'
        : 'below the end of the page'
    : `${r.left}px from the left, ${r.top}px from the top of the page`;
  const lines = [`   region ${r.width}×${r.height}px${r.fullWidth ? ', full width' : ''}, ${where}`];
  if (r.inside) lines.push(`   inside ${describeElement(r.inside, files)}`);
  if (r.elementAbove) lines.push(`   below ${describeElement(r.elementAbove, files)}`);
  if (r.elementBelow) lines.push(`   above ${describeElement(r.elementBelow, files)}`);
  for (const c of r.covers) lines.push(`   covering ${describeElement(c, files)}`);
  return lines;
}

/** `<nav> "Links" at components/Header.tsx:5 → <nav className="…">` */
export function describeElement(e: TargetElement, files: ProjectFiles): string {
  const where = parseSrc(e.src);
  const text = e.text ? ` "${e.text}"` : '';
  if (!where) return `<${e.tag}>${text}`;
  const code = files[where.path]?.split('\n')[where.line - 1]?.trim().slice(0, 120);
  return `<${e.tag}>${text} at ${where.path}:${where.line}${code ? ` → ${code}` : ''}`;
}

/** Ask for a fix, showing the current contents of every file an error names. */
export function editFixPrompt(errors: string[], files: ProjectFiles): string {
  const paths = [...new Set(errors.map((e) => e.slice(0, Math.max(0, e.indexOf(':')))).filter((p) => p in files))];
  const current = paths.flatMap((p) => [`--- ${p} ---`, files[p].replace(/\n$/, ''), `--- end of ${p} ---`]);
  return [
    'These problems stopped your changes from working:',
    ...errors.map((e) => `- ${e}`),
    '',
    ...(current.length > 0 ? ['Current contents of those files (the changes that worked are already applied):', ...current, ''] : []),
    'Send only the changes still needed, in the same format, then the <summary> line.',
  ].join('\n');
}
