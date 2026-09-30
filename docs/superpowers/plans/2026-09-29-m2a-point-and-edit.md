# M2a: Point and Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw marks on a live page (circle, arrow, cross-out, underline, sketch), see them numbered with their targets highlighted, type what to change, and get a precise AI edit of the page's React + Tailwind code. The edit is undoable in one ⌘Z, and a page that crashes after an edit is fixed once automatically or reverted.

**Architecture:**
- **The preview reports its elements.** The iframe posts every `data-src` element's rectangle after each layout. The frame keeps these in an in-memory registry, in frame-local coordinates.
- **Marks are ordinary tldraw shapes, tagged when the user creates them.** A store side effect stamps `meta.drawaiMark = { t0, t1, used }`. Because the tag is persisted, pending marks survive a reload.
- **The browser does the geometry, and it's all pure functions.** Strokes are grouped into marks, classified as gestures, hit-tested against the element map, and numbered. The panel and the on-canvas badges show that plan live, and it's the same plan that gets sent.
- **The server does the words.** `/api/edit` turns the numbered segments plus the relevant files into a compact text prompt. It asks the model for `<edit>`/`<file>`/`<delete>` blocks and applies them with exact matching (whitespace-tolerant as a fallback). It verifies with the same compiler as the preview and retries at most twice.
- **The client applies the result as one undo step** and deletes the marks in that same step. It watches the new version for 15 s: the first crash triggers one automatic fix, and a second crash (or a failed fix) restores the old page and the marks.

**Tech Stack:** Node 22 · Next.js 16.3.6 (App Router) · React 19.3.0 · tldraw 5.4.2 · @babel/standalone 7.29.9 · openai 7.23 (DeepSeek `deepseek-flash`, default) · @anthropic-ai/sdk 0.128 (`claude-opus-5`, `AI_PROVIDER=anthropic`) · lucide-react 1.48.0 · Vitest 5.0.2 · TypeScript 5.9.3

**Spec:** `docs/superpowers/specs/2026-09-28-drawai-v1-design.md` (this plan implements the first half of milestone M2, §11)

## Decisions made for this plan (spec deviations; Task 12 records them in the spec)

1. **M2 is split in two.**
   - **M2a (this plan): point and edit.** Marks, segments, badges, hit-testing, the prompt compiler, the edit API with apply/verify/retry, undo, the runtime fix, and the targeting eval.
   - **M2b: voice.** Recording, streaming STT, word-to-mark binding, draw/interact mode (`I` key), and the recorded golden set with word logs.
   - The typed instruction is the fallback the spec already requires when the mic is denied (§8), so M2a is a complete product loop on its own.
2. **Text edit blocks instead of tool use (§6.2).** The model returns `<edit path><old>…</old><new>…</new></edit>`, `<file path>…</file>` and `<delete path/>`. This keeps one provider-neutral parser for DeepSeek and Claude and matches M1's `<file>` protocol.
3. **The low-confidence image is the ink, not a page crop (§5.2).** tldraw can't rasterize the iframe's contents. For unsure marks and for freehand sketches, we attach a ≤512px PNG of the mark shapes alone, plus a geometric description.
4. **Marks are deleted in the same undo step as the edit** rather than archived. ⌘Z brings both back. Archived marks and persisted versions arrive with the M3 `versions` table.
5. **Cost and token logging moves to M3**, together with the admin log.

## Global Constraints

- Node `>=22.12` (`.nvmrc` = `22`). Run `nvm use` before `npm` commands.
- Generated pages may import only `react`, `lucide-react` and relative files. The entry file is `App.tsx`.
- The frame is 1280px wide. The iframe's CSS pixels equal the frame's local units.
- `data-src` format is `path/File.tsx:line:column` (1-based column). It exists only in the preview and never in stored or exported files.
- **Grouping:** strokes join one mark when the gap is < **1.2 s** and the bounding boxes are within **80 px** (spec §4.2).
- **Circle:** targets are elements with **≥ 70%** of their area inside the loop, outermost only. Below **40%** best overlap the mark is unsure. Arrow targets must be at least **12×12 px** (spec §5.2).
- **The ink image is ≤ 512 px** on its longest side.
- **Whole-project prompts** (no marks, or a crash fix) are allowed only up to **160,000 characters** of source (~40k tokens, spec §6.1).
- **Timeouts and retries:** the edit request times out after **45 s** (spec §8). The server makes at most **2** fix rounds (one per stage: apply, then compile). The client makes at most **1** runtime fix.
- **Request caps:** instruction ≤ **2000** chars · ≤ **60** files · ≤ **400,000** chars total · ≤ **20** segments · ink PNG ≤ **1 MB**.
- AI keys live only on the server (`.env.local`). **M2a is local-only**: no public deploy before M3 (auth and limits).
- Every AI failure shown to the user says what to do next.

## Review Focus

1. **The user keeps drawing while an edit is in flight.** Expected: only the marks that were sent are removed when the result lands. New strokes stay on the board as the next pending marks. (Task 6: `planShapeIds` test. Task 10: `sendEdit` deletes exactly `planShapeIds(plan)`.)
2. **The page was moved after it rendered.** Expected: targeting still lands on the right elements, because element rects are stored frame-local and mapped to page coordinates at plan time. (Task 3: `toPageElements` offset test.)
3. **Marks are drawn before the page has reported its elements** (the iframe is still loading). Expected: the panel says "still loading" and nothing is sent. Garbage targets must never go out. (Task 6: `planEdit` loading test.)
4. **The model quotes code with the wrong indentation, or quotes text that isn't in the file.** Expected: an indentation-tolerant match applies it. Otherwise a fix round shows the model the file's current contents. After two failed rounds the user gets a clear message and the page is unchanged. (Task 7: `replaceOnce` tests. Task 9: `editProject` retry tests.)
5. **The edited page crashes in the browser.** Expected: exactly one automatic fix. Further error reports while that fix is running are ignored. A second crash or a failed fix restores the old page and the marks. (Task 10: `decideOnCrash` tests.)

---

## File Structure

```
src/shared/
  geometry.ts          Point, Rect, rect/polyline/polygon helpers (pure)
  targets.ts           parseSrc("path:line:col"), targetElements(MarkTarget)
  types.ts             + Gesture, TargetElement, RegionDescription, MarkTarget, Segment, EditRequest, EditResponse
src/preview/
  previewMessages.ts   + 'elements' message, PreviewElement
  runtimeHtml.ts       + collectElements() and debounced 'elements' report
src/frame/
  elementRegistry.ts   per-frame element map (tldraw atom, frame-local rects)
  FramePreview.tsx     store elements; forward runtime errors to the crash handler
src/marks/             ── the mark pipeline (pure except readBoard.ts)
  types.ts             StrokeKind, Stroke, FrameInfo
  markMeta.ts          tag user-created shapes as marks; markShapesUsed
  pageElements.ts      frame-local element rects → page rects
  readBoard.ts         editor → Stroke[] / FrameInfo[] / selected frame (tldraw adapter)
  groupStrokes.ts      strokes → mark groups (1.2 s / 80 px)
  classify.ts          stroke + group gesture classification
  hitTest.ts           gesture + element map → targets, highlights, region description
  planEdit.ts          frame choice, numbering, segments, status line
  describeMark.ts      one-line label per mark for the panel
  testing.ts           test page + stroke generators (used by tests and golden cases)
  evals/score.ts       EvalCase, expectationsFor, scoreCase
  evals/goldenCases.ts synthetic golden cases
  evals/targeting.test.ts  accuracy gate (≥ 90%) over golden + recorded cases
  evals/cases/         recorded cases (JSON, added in Task 12)
src/server/
  ai/chat.ts           Generate gets an optional AbortSignal
  ai/deepseek.ts, ai/anthropic.ts   pass the signal through
  ai/userMessage.ts    timeout message; "while editing" wording
  build/prompt.ts      CODE_RULES shared with the edit prompt
  build/parseFiles.ts  export normalizePath, cleanBody
  edit/parseOps.ts     <edit>/<file>/<delete> blocks → FileOp[]
  edit/applyOps.ts     apply ops (exact, then indentation-tolerant)
  edit/editPrompt.ts   system prompt, compileEditPrompt, editFixPrompt
  edit/editProject.ts  generate → apply → verify → fix rounds
  edit/parseEditRequest.ts  validate the POST body
  edit/editProject.live.test.ts  live edit eval (EVAL_LIVE=1)
src/app/api/edit/route.ts    POST /api/edit
src/board/
  api.ts               postApi (shared by build and edit)
  imageData.ts         blobToBase64 (moved out of buildFromSelection)
  crashPolicy.ts       decideOnCrash (pure)
  editSession.ts       edit status atom + last-edit records
  sendEdit.ts          send, apply as one undo step, crash fix / revert
  useEditPlan.ts       reactive plan hook
  MarkOverlay.tsx      badges + target highlights (InFrontOfTheCanvas)
  InstructionPanel.tsx marks list, instruction box, Send, status
  recordEvalCase.ts    dev-only: download current marks as an eval case
  buildFromSelection.ts  use postApi/imageData; built sketches stop being marks
  Board.tsx            wire tracking, overlay, panel
```

---

### Task 1: Shared geometry and edit types

**Files:**
- Create: `src/shared/geometry.ts`, `src/shared/geometry.test.ts`, `src/shared/targets.ts`, `src/shared/targets.test.ts`
- Modify: `src/shared/types.ts` (append)

**Interfaces:**
- Produces: `Point`, `Rect`, `rectRight`, `rectBottom`, `rectArea`, `rectCenter`, `overlapArea`, `horizontalOverlap`, `containsPoint`, `rectGap`, `unionRects`, `boundsOf`, `distance`, `pathLength`, `pointInPolygon`, `fractionInPolygon`, `segmentsCross` (geometry.ts). `parseSrc(src) → { path, line } | null` and `targetElements(t: MarkTarget) → TargetElement[]` (targets.ts). `Gesture`, `TargetElement`, `RegionDescription`, `MarkTarget`, `Segment`, `EditRequest`, `EditResponse` (types.ts).

- [ ] **Step 1: Write the failing tests**

`src/shared/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  containsPoint,
  fractionInPolygon,
  horizontalOverlap,
  overlapArea,
  pathLength,
  pointInPolygon,
  rectGap,
  segmentsCross,
  unionRects,
} from './geometry';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('geometry', () => {
  it('measures overlap between rects', () => {
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
    expect(overlapArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(horizontalOverlap({ x: 0, y: 0, w: 10, h: 1 }, { x: 4, y: 50, w: 10, h: 1 })).toBe(6);
  });
  it('measures the gap between rects, zero when touching', () => {
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 5, h: 5 })).toBe(5);
    expect(rectGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(0);
  });
  it('builds bounds from points and rects', () => {
    expect(boundsOf([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual({ x: -1, y: 2, w: 4, h: 7 });
    expect(unionRects([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });
  it('tests points against rects and polygons', () => {
    expect(containsPoint({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });
  it('samples how much of a rect lies inside a polygon', () => {
    expect(fractionInPolygon({ x: 10, y: 10, w: 20, h: 20 }, square)).toBe(1);
    expect(fractionInPolygon({ x: 50, y: 0, w: 100, h: 100 }, square)).toBe(0.5);
    expect(fractionInPolygon({ x: 0, y: 0, w: 0, h: 10 }, square)).toBe(0);
  });
  it('measures path length and segment crossings', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
});
```

`src/shared/targets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseSrc, targetElements } from './targets';

const nav = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Links' };
const hero = { src: 'components/Hero.tsx:5:5', tag: 'section', text: '' };

describe('targets', () => {
  it('parses a data-src tag', () => {
    expect(parseSrc('components/Header.tsx:18:4')).toEqual({ path: 'components/Header.tsx', line: 18 });
    expect(parseSrc('nonsense')).toBeNull();
  });
  it('lists the elements a target refers to', () => {
    expect(targetElements({ kind: 'elements', elements: [nav] })).toEqual([nav]);
    const region = {
      width: 100, height: 50, left: 0, top: 0, fullWidth: false, outside: null,
      inside: hero, elementAbove: null, elementBelow: nav, covers: [],
    } as const;
    expect(targetElements({ kind: 'region', region })).toEqual([hero, nav]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared`
Expected: FAIL. The modules `./geometry` and `./targets` can't be found.

- [ ] **Step 3: Implement**

`src/shared/geometry.ts`:
```ts
/** Plane geometry in page coordinates, shared by the preview, the mark pipeline and tests. */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectRight = (r: Rect): number => r.x + r.w;
export const rectBottom = (r: Rect): number => r.y + r.h;
export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h);
export const rectCenter = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  const h = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function horizontalOverlap(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x));
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= rectRight(r) && p.y >= r.y && p.y <= rectBottom(r);
}

/** Distance between two rects; 0 when they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - rectRight(b), b.x - rectRight(a));
  const dy = Math.max(0, a.y - rectBottom(b), b.y - rectBottom(a));
  return Math.hypot(dx, dy);
}

export function unionRects(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map(rectRight)) - x, h: Math.max(...rects.map(rectBottom)) - y };
}

export function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pathLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distance(points[i - 1], points[i]);
  return sum;
}

/** Ray casting; the polygon is closed implicitly. */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const SAMPLES = 6;

/** Share of a rect's area inside a closed polygon, sampled on a 6×6 grid. */
export function fractionInPolygon(r: Rect, poly: Point[]): number {
  if (poly.length < 3 || rectArea(r) === 0) return 0;
  let hits = 0;
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const p = { x: r.x + ((i + 0.5) / SAMPLES) * r.w, y: r.y + ((j + 0.5) / SAMPLES) * r.h };
      if (pointInPolygon(p, poly)) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

/** True when segment a1–a2 properly crosses segment b1–b2. */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a1, a2, b1) * side(a1, a2, b2) < 0 && side(b1, b2, a1) * side(b1, b2, a2) < 0;
}
```

Append to `src/shared/types.ts`:
```ts
export type Gesture = 'circle' | 'arrow' | 'cross-out' | 'underline' | 'sketch';

/** A page element a mark refers to, as the server sees it. */
export interface TargetElement {
  /** data-src tag: "components/Header.tsx:18:4". */
  src: string;
  tag: string;
  /** The element's visible text, shortened. */
  text: string;
}

/** Where a sketched (or unsure) region sits on the page. Sizes are page pixels. */
export interface RegionDescription {
  width: number;
  height: number;
  /** Offset from the page's top-left corner. */
  left: number;
  top: number;
  fullWidth: boolean;
  /** Set when the region lies entirely outside the page on this side. */
  outside: 'left' | 'right' | 'above' | 'below' | null;
  /** The smallest element that contains the region. */
  inside: TargetElement | null;
  /** The element right above the region, and the one right below it. */
  elementAbove: TargetElement | null;
  elementBelow: TargetElement | null;
  /** Existing elements the region mostly covers. */
  covers: TargetElement[];
}

export type MarkTarget =
  | { kind: 'elements'; elements: TargetElement[] }
  | { kind: 'region'; region: RegionDescription };

/** One numbered mark, compiled in the browser and sent to the edit API. */
export interface Segment {
  n: number;
  gesture: Gesture;
  target: MarkTarget;
  /** Where an arrow points when the mark also has a source: "move this there". */
  pointsTo?: MarkTarget;
  /** The mark didn't land cleanly on an element. */
  unsure: boolean;
  /** Text written in text shapes, notes or labelled boxes inside the mark. */
  wrote: string[];
  /** PNG (base64) of the ink alone, for freehand sketches and unsure marks. */
  inkPng?: string;
}

export interface EditRequest {
  files: ProjectFiles;
  segments: Segment[];
  instruction: string;
  /** Set to ask for a fix after the edited page crashed in the preview. */
  runtimeError?: string;
}

export type EditResponse = BuildResponse;
```

`src/shared/targets.ts`:
```ts
import type { MarkTarget, TargetElement } from './types';

const SRC_RE = /^(.+):(\d+):(\d+)$/;

/** Split a data-src tag ("components/Header.tsx:18:4") into its file path and line. */
export function parseSrc(src: string): { path: string; line: number } | null {
  const match = src.match(SRC_RE);
  return match ? { path: match[1], line: Number(match[2]) } : null;
}

/** Every element a target names: the elements themselves, or a region's neighbours. */
export function targetElements(target: MarkTarget): TargetElement[] {
  if (target.kind === 'elements') return target.elements;
  const { inside, elementAbove, elementBelow, covers } = target.region;
  return [inside, elementAbove, elementBelow, ...covers].filter((e): e is TargetElement => e !== null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared && npm run typecheck`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared
git commit -m "feat(shared): geometry helpers and edit request types"
```

---

### Task 2: The preview reports its element map

**Files:**
- Modify: `src/preview/previewMessages.ts`, `src/preview/previewMessages.test.ts`, `src/preview/runtimeHtml.ts`, `src/preview/runtimeHtml.test.ts`, `src/frame/FramePreview.tsx`
- Create: `src/frame/elementRegistry.ts`

**Interfaces:**
- Consumes: `Rect` (Task 1), `DATA_SRC_ATTR` from `src/preview/dataSrcPlugin.ts`.
- Produces: `PreviewElement { src; tag; text; rect: Rect; parent: number }`, where `parent` is the index of the nearest tagged ancestor, or -1. `PreviewMessage` gains `{ type: 'elements'; elements: PreviewElement[] }` and `MAX_ELEMENTS = 3000`. From `elementRegistry.ts`: `setFrameElements(id: TLShapeId, elements: PreviewElement[])` and `getFrameElements(id: TLShapeId): PreviewElement[] | undefined` (reactive; frame-local rects).

- [ ] **Step 1: Write the failing tests**

Append to `src/preview/previewMessages.test.ts` inside the existing `describe`:
```ts
  it('parses an element map', () => {
    const elements = [
      { src: 'App.tsx:6:5', tag: 'main', text: '', rect: { x: 0, y: 0, w: 1280, h: 900 }, parent: -1 },
      { src: 'components/Hero.tsx:6:7', tag: 'h1', text: 'Hi', rect: { x: 40, y: 80, w: 300, h: 60 }, parent: 0 },
    ];
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements })).toEqual({ type: 'elements', elements });
  });
  it('rejects an element map with a malformed entry or a forward parent', () => {
    const good = { src: 'App.tsx:6:5', tag: 'main', text: '', rect: { x: 0, y: 0, w: 10, h: 10 }, parent: -1 };
    const badRect = { ...good, rect: { x: 0, y: 0, w: 'wide', h: 10 } };
    const forward = { ...good, parent: 1 };
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: [good, badRect] })).toBeNull();
    expect(parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: [forward, good] })).toBeNull();
  });
  it('caps the element map', () => {
    const one = { src: 'App.tsx:6:5', tag: 'div', text: '', rect: { x: 0, y: 0, w: 10, h: 10 }, parent: -1 };
    const msg = parsePreviewMessage({ source: PREVIEW_SOURCE, type: 'elements', elements: Array(MAX_ELEMENTS + 5).fill(one) });
    expect(msg?.type === 'elements' && msg.elements.length).toBe(MAX_ELEMENTS);
  });
```
Change the file's imports to:
```ts
import { MAX_ELEMENTS, parsePreviewMessage } from './previewMessages';
import { PREVIEW_SOURCE } from './runtimeHtml';
```

Append to `src/preview/runtimeHtml.test.ts` inside `describe('buildRuntimeHtml', …)`:
```ts
  it('reports the tagged element map after layout', () => {
    const html = buildRuntimeHtml({ 'App.tsx': { code: '', deps: {} } }, 'App.tsx');
    expect(html).toContain("querySelectorAll('[data-src]')");
    expect(html).toContain("type: 'elements'");
    expect(html).toContain('new ResizeObserver(reportLayout)');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/preview`
Expected: FAIL. `MAX_ELEMENTS` isn't exported, the elements message returns null, and the HTML lacks `collectElements`.

- [ ] **Step 3: Implement**

`src/preview/previewMessages.ts`:
```ts
import type { Rect } from '@/shared/geometry';
import { PREVIEW_SOURCE } from './runtimeHtml';

/** A tagged element in the preview, in the page's CSS pixels (document coordinates). */
export interface PreviewElement {
  /** data-src tag: "components/Header.tsx:18:4". */
  src: string;
  tag: string;
  text: string;
  rect: Rect;
  /** Index of the nearest tagged ancestor in the same list, or -1. */
  parent: number;
}

export type PreviewMessage =
  | { type: 'height'; height: number }
  | { type: 'runtime-error'; message: string }
  | { type: 'elements'; elements: PreviewElement[] };

export const MAX_ELEMENTS = 3000;

/** Validate a postMessage payload from the preview iframe. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== PREVIEW_SOURCE) return null;
  if (msg.type === 'height' && typeof msg.height === 'number' && Number.isFinite(msg.height)) {
    return { type: 'height', height: msg.height };
  }
  if (msg.type === 'runtime-error' && typeof msg.message === 'string') {
    return { type: 'runtime-error', message: msg.message };
  }
  if (msg.type === 'elements' && Array.isArray(msg.elements)) {
    const elements = msg.elements.slice(0, MAX_ELEMENTS).map(toElement);
    // Parent indexes point into this list, so one bad entry makes the whole map untrustworthy.
    if (elements.some((e, i) => e === null || e.parent >= i)) return null;
    return { type: 'elements', elements: elements as PreviewElement[] };
  }
  return null;
}

function toElement(value: unknown): PreviewElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const { src, tag, text, rect, parent } = value as Record<string, unknown>;
  if (typeof src !== 'string' || typeof tag !== 'string' || typeof text !== 'string') return null;
  if (typeof parent !== 'number' || !Number.isInteger(parent) || parent < -1) return null;
  if (typeof rect !== 'object' || rect === null) return null;
  const { x, y, w, h } = rect as Record<string, unknown>;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { src, tag, text: text.slice(0, 80), rect: { x: x as number, y: y as number, w: w as number, h: h as number }, parent };
}
```

`src/preview/runtimeHtml.ts`: add `import { DATA_SRC_ATTR } from './dataSrcPlugin';` at the top. In `buildRuntimeHtml`, replace the `try { … }` block of the module script with the code below. **Watch the backslashes:** this code sits inside a TypeScript template literal, so the regex must be written `\\s` in the `.ts` source to reach the browser as `\s`.
```js
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
try {
  const App = load(${JSON.stringify(entry)}).default;
  createRoot(document.getElementById('root')).render(externals.react.createElement(App));
  window.__drawaiReady = true;
  new ResizeObserver(reportLayout).observe(document.body);
} catch (err) {
  report({ type: 'runtime-error', message: String(err && err.message ? err.message : err) });
}
```
The test in Step 1 checks for `'[data-src]'`, which is what `'[${DATA_SRC_ATTR}]'` expands to.

`src/frame/elementRegistry.ts`:
```ts
import { atom, type TLShapeId } from 'tldraw';
import type { PreviewElement } from '@/preview/previewMessages';

// Latest element map each frame's preview reported, in frame-local coordinates. Kept out of the
// shape props: it is derived from the files, changes on every layout, and must not enter undo history.
const frameElements = atom<ReadonlyMap<TLShapeId, PreviewElement[]>>('frame elements', new Map());

export function setFrameElements(id: TLShapeId, elements: PreviewElement[]): void {
  const next = new Map(frameElements.get());
  next.set(id, elements);
  frameElements.set(next);
}

/** Reactive: reading this inside useValue/computed re-runs when the map changes. */
export function getFrameElements(id: TLShapeId): PreviewElement[] | undefined {
  return frameElements.get().get(id);
}
```

`src/frame/FramePreview.tsx`: import `setFrameElements` from `./elementRegistry`. In `onMessage`, directly after `if (!msg) return;`, add:
```ts
      if (msg.type === 'elements') {
        setFrameElements(shape.id, msg.elements);
        return;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/preview && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preview src/frame
git commit -m "feat(preview): report tagged element rects to the board"
```

---

### Task 3: Mark tagging and reading the board

**Files:**
- Create: `src/marks/types.ts`, `src/marks/markMeta.ts`, `src/marks/markMeta.test.ts`, `src/marks/pageElements.ts`, `src/marks/pageElements.test.ts`, `src/marks/readBoard.ts`
- Modify: `src/board/buildFromSelection.ts`, `src/board/Board.tsx`

**Interfaces:**
- Consumes: `Point`, `Rect`, `boundsOf` (Task 1). `PreviewElement` and `getFrameElements` (Task 2).
- Produces:
  - `types.ts`: `StrokeKind = 'draw' | 'ellipse' | 'rectangle' | 'arrow' | 'line' | 'text' | 'note' | 'other'`, `Stroke { shapeId: string; kind; points: Point[]; bounds: Rect; t0: number; t1: number; text?: string }` and `FrameInfo { id: string; bounds: Rect; elements: PreviewElement[] | null }` (page coordinates; `null` = not reported yet).
  - `markMeta.ts`: `MARK_META_KEY`, `MARK_SHAPE_TYPES`, `MarkMeta`, `readMarkMeta`, `withMarkMeta`, `registerMarkTracking(editor, now?) → () => void` and `markShapesUsed(editor, ids)`.
  - `pageElements.ts`: `toPageElements(elements, toPage) → PreviewElement[]`.
  - `readBoard.ts`: `readPendingStrokes(editor): Stroke[]`, `readFrames(editor): FrameInfo[]` and `selectedFrameId(editor): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/marks/markMeta.test.ts`:
```ts
import type { Editor } from 'tldraw';
import { describe, expect, it } from 'vitest';
import { MARK_META_KEY, readMarkMeta, registerMarkTracking } from './markMeta';

type Shape = { id: string; type: string; meta: Record<string, unknown>; props: Record<string, unknown> };
type Create = (shape: Shape, source: 'user' | 'remote') => Shape;
type Change = (prev: Shape, next: Shape, source: 'user' | 'remote') => Shape;

function fakeEditor() {
  const handlers: { create?: Create; change?: Change } = {};
  const editor = {
    sideEffects: {
      registerBeforeCreateHandler: (_: string, h: Create) => ((handlers.create = h), () => {}),
      registerBeforeChangeHandler: (_: string, h: Change) => ((handlers.change = h), () => {}),
    },
  } as unknown as Pick<Editor, 'sideEffects'>;
  return { editor, handlers };
}

const draw = (meta: Record<string, unknown> = {}, isComplete = false): Shape => ({
  id: 'shape:a', type: 'draw', meta, props: { isComplete },
});

describe('markMeta', () => {
  it('reads valid mark meta and ignores anything else', () => {
    expect(readMarkMeta({ meta: { [MARK_META_KEY]: { t0: 1, t1: 2, used: false } } })).toEqual({ t0: 1, t1: 2, used: false });
    expect(readMarkMeta({ meta: { [MARK_META_KEY]: { t0: 'x' } } })).toBeNull();
    expect(readMarkMeta({ meta: {} })).toBeNull();
  });
  it('tags shapes the user creates, and only drawing shapes', () => {
    const { editor, handlers } = fakeEditor();
    registerMarkTracking(editor, () => 1000);
    expect(readMarkMeta(handlers.create!(draw(), 'user'))).toEqual({ t0: 1000, t1: 1000, used: false });
    expect(readMarkMeta(handlers.create!(draw(), 'remote'))).toBeNull();
    expect(readMarkMeta(handlers.create!({ ...draw(), type: 'image' }, 'user'))).toBeNull();
  });
  it('keeps existing mark meta when a mark is restored (undo, revert)', () => {
    const { editor, handlers } = fakeEditor();
    registerMarkTracking(editor, () => 5000);
    const restored = draw({ [MARK_META_KEY]: { t0: 10, t1: 20, used: false } });
    expect(readMarkMeta(handlers.create!(restored, 'user'))).toEqual({ t0: 10, t1: 20, used: false });
  });
  it('stretches t1 only while a pen stroke is still being drawn', () => {
    const { editor, handlers } = fakeEditor();
    let now = 1000;
    registerMarkTracking(editor, () => now);
    const drawing = draw({ [MARK_META_KEY]: { t0: 1000, t1: 1000, used: false } }, false);
    now = 1600;
    expect(readMarkMeta(handlers.change!(drawing, drawing, 'user'))?.t1).toBe(1600);
    const done = draw({ [MARK_META_KEY]: { t0: 1000, t1: 1000, used: false } }, true);
    now = 9000;
    expect(readMarkMeta(handlers.change!(done, done, 'user'))?.t1).toBe(1000);
  });
});
```

`src/marks/pageElements.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toPageElements } from './pageElements';

describe('toPageElements', () => {
  it('moves frame-local rects to wherever the frame now sits', () => {
    const local = [{ src: 'App.tsx:6:5', tag: 'h1', text: 'Hi', rect: { x: 40, y: 80, w: 300, h: 60 }, parent: -1 }];
    const moved = toPageElements(local, (p) => ({ x: p.x + 2000, y: p.y + 500 }));
    expect(moved[0].rect).toEqual({ x: 2040, y: 580, w: 300, h: 60 });
    expect(local[0].rect.x).toBe(40);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/marks`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/marks/types.ts`:
```ts
import type { PreviewElement } from '@/preview/previewMessages';
import type { Point, Rect } from '@/shared/geometry';

export type StrokeKind = 'draw' | 'ellipse' | 'rectangle' | 'arrow' | 'line' | 'text' | 'note' | 'other';

/** One user-drawn shape, in page coordinates. */
export interface Stroke {
  shapeId: string;
  kind: StrokeKind;
  /** Pen path, shape outline, or [tail, head] for arrows. */
  points: Point[];
  bounds: Rect;
  /** Epoch ms: when drawing started, and when the stroke was last extended. */
  t0: number;
  t1: number;
  /** Text written in a text shape, note or labelled box. */
  text?: string;
}

/** A built page on the board. */
export interface FrameInfo {
  id: string;
  bounds: Rect;
  /** Tagged elements in page coordinates; null until the preview reports them. */
  elements: PreviewElement[] | null;
}
```

`src/marks/markMeta.ts`:
```ts
import type { Editor, JsonObject, TLShapeId } from 'tldraw';

export const MARK_META_KEY = 'drawaiMark';
/** Shapes that count as marks when the user draws them. Images and frames never do. */
export const MARK_SHAPE_TYPES: ReadonlySet<string> = new Set(['draw', 'highlight', 'geo', 'arrow', 'line', 'text', 'note']);

// A type alias (not an interface) so it is assignable to tldraw's JsonObject meta.
export type MarkMeta = { t0: number; t1: number; used: boolean };

export function readMarkMeta(shape: { meta: unknown }): MarkMeta | null {
  const value = (shape.meta as Record<string, unknown> | undefined)?.[MARK_META_KEY];
  if (typeof value !== 'object' || value === null) return null;
  const { t0, t1, used } = value as Record<string, unknown>;
  if (typeof t0 !== 'number' || typeof t1 !== 'number') return null;
  return { t0, t1, used: used === true };
}

export function withMarkMeta<S extends { meta: JsonObject }>(shape: S, mark: MarkMeta): S {
  return { ...shape, meta: { ...shape.meta, [MARK_META_KEY]: { ...mark } } };
}

/**
 * Tag every drawing shape the user creates as a pending mark, and stretch its end time while a pen
 * stroke is still being drawn. Restored shapes (undo, revert) keep their original tag.
 */
export function registerMarkTracking(editor: Pick<Editor, 'sideEffects'>, now: () => number = Date.now): () => void {
  const offCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
    if (source !== 'user' || !MARK_SHAPE_TYPES.has(shape.type) || readMarkMeta(shape)) return shape;
    const t = now();
    return withMarkMeta(shape, { t0: t, t1: t, used: false });
  });
  const offChange = editor.sideEffects.registerBeforeChangeHandler('shape', (prev, next, source) => {
    const mark = readMarkMeta(next);
    if (source !== 'user' || !mark || mark.used || !isBeingDrawn(prev)) return next;
    return withMarkMeta(next, { ...mark, t1: now() });
  });
  return () => {
    offCreate();
    offChange();
  };
}

function isBeingDrawn(shape: { type: string; props: unknown }): boolean {
  return (shape.type === 'draw' || shape.type === 'highlight') && (shape.props as { isComplete?: boolean }).isComplete === false;
}

/** Stop shapes counting as marks, e.g. a sketch that was just built into a page. */
export function markShapesUsed(editor: Editor, ids: readonly TLShapeId[]): void {
  const updates = ids.flatMap((id) => {
    const shape = editor.getShape(id);
    const mark = shape ? readMarkMeta(shape) : null;
    return shape && mark ? [{ id: shape.id, type: shape.type, meta: withMarkMeta(shape, { ...mark, used: true }).meta }] : [];
  });
  if (updates.length > 0) editor.run(() => editor.updateShapes(updates), { history: 'ignore' });
}
```

`src/marks/pageElements.ts`:
```ts
import type { PreviewElement } from '@/preview/previewMessages';
import { boundsOf, type Point } from '@/shared/geometry';

/** Map frame-local element rects to page rects with the frame's current transform. */
export function toPageElements(elements: PreviewElement[], toPage: (p: Point) => Point): PreviewElement[] {
  return elements.map((el) => {
    const { x, y, w, h } = el.rect;
    const corners = [
      { x, y },
      { x: x + w, y },
      { x, y: y + h },
      { x: x + w, y: y + h },
    ].map(toPage);
    return { ...el, rect: boundsOf(corners) };
  });
}
```

`src/marks/readBoard.ts` (a tldraw adapter, verified manually in Task 12):
```ts
import { getArrowInfo, type Editor, type TLArrowShape, type TLShape } from 'tldraw';
import { getFrameElements } from '@/frame/elementRegistry';
import type { FrameShape } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import type { Point } from '@/shared/geometry';
import { readMarkMeta } from './markMeta';
import { toPageElements } from './pageElements';
import type { FrameInfo, Stroke, StrokeKind } from './types';

/** Marks the user has drawn and not yet sent (or built), in page coordinates. */
export function readPendingStrokes(editor: Editor): Stroke[] {
  return editor.getCurrentPageShapes().flatMap((shape) => {
    const mark = readMarkMeta(shape);
    if (!mark || mark.used) return [];
    const stroke = toStroke(editor, shape, mark.t0, mark.t1);
    return stroke ? [stroke] : [];
  });
}

function toStroke(editor: Editor, shape: TLShape, t0: number, t1: number): Stroke | null {
  const box = editor.getShapePageBounds(shape);
  if (!box) return null;
  let local: Point[];
  if (shape.type === 'arrow') {
    const info = getArrowInfo(editor, shape as TLArrowShape);
    if (!info) return null;
    local = [info.start.point, info.end.point];
  } else {
    local = editor.getShapeGeometry(shape).vertices;
  }
  const text = editor.getShapeUtil(shape).getText(shape)?.trim();
  return {
    shapeId: shape.id,
    kind: strokeKind(shape),
    points: editor.getShapePageTransform(shape).applyToPoints(local).map(({ x, y }) => ({ x, y })),
    bounds: { x: box.x, y: box.y, w: box.w, h: box.h },
    t0,
    t1,
    ...(text ? { text } : {}),
  };
}

function strokeKind(shape: TLShape): StrokeKind {
  switch (shape.type) {
    case 'draw':
    case 'highlight':
      return 'draw';
    case 'arrow':
    case 'line':
    case 'text':
    case 'note':
      return shape.type;
    case 'geo': {
      const geo = (shape.props as { geo?: string }).geo;
      if (geo === 'ellipse' || geo === 'oval') return 'ellipse';
      return geo === 'rectangle' ? 'rectangle' : 'other';
    }
    default:
      return 'other';
  }
}

/** Built pages that are ready, with their element maps moved to page coordinates. */
export function readFrames(editor: Editor): FrameInfo[] {
  return editor.getCurrentPageShapes().flatMap((shape) => {
    if (shape.type !== FRAME_TYPE) return [];
    const frame = shape as FrameShape;
    const box = editor.getShapePageBounds(frame);
    if (!box || frame.props.status !== 'ready') return [];
    const elements = getFrameElements(frame.id);
    const transform = editor.getShapePageTransform(frame);
    return [
      {
        id: frame.id,
        bounds: { x: box.x, y: box.y, w: box.w, h: box.h },
        elements: elements ? toPageElements(elements, (p) => transform.applyToPoint(p)) : null,
      },
    ];
  });
}

/** The frame when exactly one frame is selected: target of a whole-page instruction. */
export function selectedFrameId(editor: Editor): string | null {
  const ids = editor.getSelectedShapeIds();
  const only = ids.length === 1 ? editor.getShape(ids[0]) : undefined;
  return only?.type === FRAME_TYPE ? only.id : null;
}
```

`src/board/buildFromSelection.ts`: import `markShapesUsed` from `@/marks/markMeta`. Directly after `startBuild(frameId);`, add:
```ts
  // The sketch is now a page of its own: it must not be read as edit marks for the frame beside it.
  markShapesUsed(editor, shapes.map((s) => s.id));
```

`src/board/Board.tsx`: import `registerMarkTracking` from `@/marks/markMeta`. At the end of the `onMount` callback, after `setEditor(mounted);`, add `return registerMarkTracking(mounted);`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/marks && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/marks src/board
git commit -m "feat(marks): tag drawn shapes as marks and read them in page space"
```

---

### Task 4: Grouping strokes and classifying gestures

**Files:**
- Create: `src/marks/testing.ts`, `src/marks/groupStrokes.ts`, `src/marks/groupStrokes.test.ts`, `src/marks/classify.ts`, `src/marks/classify.test.ts`

**Interfaces:**
- Consumes: geometry (Task 1). `Stroke`, `StrokeKind` and `FrameInfo` (Task 3). `PreviewElement` (Task 2).
- Produces:
  - `groupStrokes.ts`: `MarkGroup { strokes: Stroke[]; bounds: Rect; t0: number; t1: number }`, `groupStrokes(strokes): MarkGroup[]` (time-ordered), `GROUP_GAP_MS = 1200` and `GROUP_DISTANCE_PX = 80`.
  - `classify.ts`: `StrokeShape`, `classifyStroke(points)`, `countReversals(values, threshold)`, `ClassifiedMark { gesture: Gesture; loop?: Point[]; arrow?: { tail: Point; head: Point }; wrote: string[]; freehand: boolean }` and `classifyMark(strokes): ClassifiedMark`.
  - `testing.ts`: `PAGE`, `PAGE_ELEMENTS`, `PAGE_BOUNDS`, `src(i)`, `rectOf(i)`, `stroke(kind, points, t0?, text?)`, `loopAround(rect)`, `line(a, b)`, `zigzag(rect)`, `arrowStroke(tail, head)`, `arrowHead(tail, head)` and `rectOutline(rect)`.

- [ ] **Step 1: Write the test fixtures module**

`src/marks/testing.ts`:
```ts
import type { PreviewElement } from '@/preview/previewMessages';
import { boundsOf, type Point, type Rect } from '@/shared/geometry';
import type { FrameInfo, Stroke, StrokeKind } from './types';

export const PAGE_BOUNDS: Rect = { x: 0, y: 0, w: 1280, h: 1400 };

function el(src: string, tag: string, text: string, [x, y, w, h]: number[], parent: number): PreviewElement {
  return { src, tag, text, rect: { x, y, w, h }, parent };
}

/** A landing page at the origin: header with nav, hero, three feature cards, footer. */
export const PAGE_ELEMENTS: PreviewElement[] = [
  el('App.tsx:6:5', 'main', '', [0, 0, 1280, 1400], -1), // 0
  el('components/Header.tsx:3:5', 'header', 'Acme Product Pricing Blog', [0, 0, 1280, 72], 0), // 1
  el('components/Header.tsx:4:7', 'span', 'Acme', [32, 20, 80, 32], 1), // 2
  el('components/Header.tsx:5:7', 'nav', 'Product Pricing Blog', [900, 24, 300, 24], 1), // 3
  el('components/Header.tsx:6:9', 'a', 'Product', [900, 24, 70, 24], 3), // 4
  el('components/Header.tsx:7:9', 'a', 'Pricing', [990, 24, 70, 24], 3), // 5
  el('components/Header.tsx:8:9', 'a', 'Blog', [1080, 24, 60, 24], 3), // 6
  el('components/Hero.tsx:5:5', 'section', 'Sketch it. Ship it.', [0, 72, 1280, 528], 0), // 7
  el('components/Hero.tsx:6:7', 'h1', 'Sketch it. Ship it.', [340, 200, 600, 72], 7), // 8
  el('components/Hero.tsx:7:7', 'p', 'Draw your idea and get a real page.', [390, 290, 500, 28], 7), // 9
  el('components/Hero.tsx:8:7', 'button', 'Get started', [560, 350, 160, 48], 7), // 10
  el('components/Features.tsx:4:5', 'section', 'Fast Simple Yours', [0, 600, 1280, 500], 0), // 11
  el('components/Features.tsx:6:9', 'div', 'Fast', [80, 700, 340, 300], 11), // 12
  el('components/Features.tsx:7:9', 'div', 'Simple', [470, 700, 340, 300], 11), // 13
  el('components/Features.tsx:8:9', 'div', 'Yours', [860, 700, 340, 300], 11), // 14
  el('components/Footer.tsx:3:5', 'footer', '© Acme', [0, 1100, 1280, 300], 0), // 15
];

export const PAGE: FrameInfo = { id: 'shape:page', bounds: PAGE_BOUNDS, elements: PAGE_ELEMENTS };
export const src = (i: number): string => PAGE_ELEMENTS[i].src;
export const rectOf = (i: number): Rect => PAGE_ELEMENTS[i].rect;

let nextId = 0;
export function stroke(kind: StrokeKind, points: Point[], t0 = 0, text?: string): Stroke {
  return { shapeId: `shape:t${nextId++}`, kind, points, bounds: boundsOf(points), t0, t1: t0 + 400, ...(text ? { text } : {}) };
}

/** A closed loop loose enough to enclose the rect's corners. */
export function loopAround(r: Rect, n = 32): Point[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = (r.w / 2) * 1.5;
  const ry = (r.h / 2) * 1.5;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

export function line(a: Point, b: Point, n = 12): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/** Left-right scribble moving down the rect. */
export function zigzag(r: Rect, teeth = 5): Point[] {
  return Array.from({ length: teeth + 1 }, (_, i) => ({ x: i % 2 === 0 ? r.x : r.x + r.w, y: r.y + (r.h * i) / teeth }));
}

/** The two wings of an arrowhead at `head`, pointing away from `tail`. */
function wings(tail: Point, head: Point): [Point, Point] {
  const len = Math.hypot(head.x - tail.x, head.y - tail.y);
  const ux = (head.x - tail.x) / len;
  const uy = (head.y - tail.y) / len;
  const wing = len * 0.25;
  const at = (a: number) => ({
    x: head.x - wing * (ux * Math.cos(a) - uy * Math.sin(a)),
    y: head.y - wing * (uy * Math.cos(a) + ux * Math.sin(a)),
  });
  return [at(Math.PI / 6), at(-Math.PI / 6)];
}

/** One pen stroke: shaft, then the head drawn without lifting the pen. */
export function arrowStroke(tail: Point, head: Point): Point[] {
  const [a, b] = wings(tail, head);
  return [...line(tail, head), a, head, b];
}

/** A separate V-shaped head stroke. */
export function arrowHead(tail: Point, head: Point): Point[] {
  const [a, b] = wings(tail, head);
  return [a, head, b];
}

export function rectOutline(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: r.y },
  ];
}
```

- [ ] **Step 2: Write the failing tests**

`src/marks/groupStrokes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { groupStrokes } from './groupStrokes';
import { line, stroke } from './testing';

describe('groupStrokes', () => {
  it('joins strokes drawn close together in quick succession', () => {
    const a = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const b = stroke('draw', line({ x: 110, y: 10 }, { x: 150, y: 10 }), 700);
    const groups = groupStrokes([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].bounds).toEqual({ x: 0, y: 0, w: 150, h: 10 });
    expect(groups[0].t1).toBe(1100);
  });
  it('splits on a long pause or a big distance', () => {
    const a = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const late = stroke('draw', line({ x: 110, y: 0 }, { x: 150, y: 0 }), 2000);
    const far = stroke('draw', line({ x: 600, y: 0 }, { x: 700, y: 0 }), 500);
    expect(groupStrokes([a, late])).toHaveLength(2);
    expect(groupStrokes([a, far])).toHaveLength(2);
  });
  it('orders marks by time whatever the input order', () => {
    const first = stroke('draw', line({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
    const second = stroke('draw', line({ x: 900, y: 0 }, { x: 1000, y: 0 }), 5000);
    expect(groupStrokes([second, first]).map((g) => g.t0)).toEqual([0, 5000]);
  });
});
```

`src/marks/classify.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyMark, classifyStroke, countReversals } from './classify';
import { arrowHead, arrowStroke, line, loopAround, rectOf, rectOutline, stroke, zigzag } from './testing';

describe('countReversals', () => {
  it('counts direction changes bigger than the threshold', () => {
    expect(countReversals([0, 10, 20, 10, 0, 10, 20], 8)).toBe(2);
    expect(countReversals([0, 20, 0, 20, 0], 8)).toBe(3);
    expect(countReversals([0, 3, 0, 3, 0], 8)).toBe(0);
  });
});

describe('classifyStroke', () => {
  it('reads a closed loop as a circle', () => {
    expect(classifyStroke(loopAround(rectOf(3))).shape).toBe('circle');
  });
  it('reads a one-stroke arrow with its tail and head', () => {
    const reading = classifyStroke(arrowStroke({ x: 200, y: 480 }, { x: 600, y: 374 }));
    expect(reading.shape).toBe('arrow');
    expect(reading.head).toEqual({ x: 600, y: 374 });
    expect(reading.tail).toEqual({ x: 200, y: 480 });
  });
  it('reads a zigzag as a cross-out, not a circle', () => {
    expect(classifyStroke(zigzag({ x: 490, y: 720, w: 300, h: 260 })).shape).toBe('cross-out');
  });
  it('reads a flat line as an underline and a diagonal as straight', () => {
    expect(classifyStroke(line({ x: 360, y: 278 }, { x: 920, y: 278 })).shape).toBe('underline');
    expect(classifyStroke(line({ x: 0, y: 0 }, { x: 200, y: 200 })).shape).toBe('straight');
  });
  it('treats tiny strokes as scribbles', () => {
    expect(classifyStroke([{ x: 0, y: 0 }, { x: 3, y: 3 }]).shape).toBe('scribble');
  });
});

describe('classifyMark', () => {
  it('uses tool shapes as they are', () => {
    expect(classifyMark([stroke('ellipse', loopAround(rectOf(3)))]).gesture).toBe('circle');
    const toolArrow = classifyMark([stroke('arrow', [{ x: 1110, y: 36 }, { x: 640, y: 1200 }])]);
    expect(toolArrow).toMatchObject({ gesture: 'arrow', arrow: { tail: { x: 1110, y: 36 }, head: { x: 640, y: 1200 } } });
  });
  it('joins two crossing lines into a cross-out', () => {
    const r = { x: 880, y: 720, w: 300, h: 260 };
    const x = classifyMark([
      stroke('draw', line({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h })),
      stroke('draw', line({ x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h })),
    ]);
    expect(x.gesture).toBe('cross-out');
  });
  it('joins a shaft and a separate head into an arrow', () => {
    const tail = { x: 200, y: 480 };
    const head = { x: 600, y: 374 };
    const mark = classifyMark([stroke('draw', line(tail, head)), stroke('draw', arrowHead(tail, head))]);
    expect(mark.gesture).toBe('arrow');
    expect(mark.arrow?.head).toEqual(head);
  });
  it('keeps the arrow of a circle-plus-arrow mark', () => {
    const mark = classifyMark([
      stroke('draw', loopAround(rectOf(12))),
      stroke('arrow', [{ x: 420, y: 850 }, { x: 1250, y: 850 }]),
    ]);
    expect(mark.gesture).toBe('circle');
    expect(mark.arrow?.head).toEqual({ x: 1250, y: 850 });
  });
  it('treats boxes and lines as a sketch and collects written words', () => {
    const mark = classifyMark([
      stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 })),
      stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 0, 'Testimonials'),
    ]);
    expect(mark).toMatchObject({ gesture: 'sketch', wrote: ['Testimonials'], freehand: false });
  });
  it('lets a written note ride along with a circle', () => {
    const mark = classifyMark([stroke('draw', loopAround(rectOf(3))), stroke('text', rectOutline(rectOf(2)), 0, 'bigger')]);
    expect(mark).toMatchObject({ gesture: 'circle', wrote: ['bigger'], freehand: true });
  });
  it('falls back to a sketch for unreadable pen strokes', () => {
    const scribble = [{ x: 0, y: 0 }, { x: 40, y: 90 }, { x: 80, y: 10 }, { x: 10, y: 60 }, { x: 95, y: 70 }];
    expect(classifyMark([stroke('draw', scribble)]).gesture).toBe('sketch');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/marks`
Expected: FAIL (`./groupStrokes` and `./classify` not found).

- [ ] **Step 4: Implement**

`src/marks/groupStrokes.ts`:
```ts
import { rectGap, unionRects, type Rect } from '@/shared/geometry';
import type { Stroke } from './types';

export const GROUP_GAP_MS = 1200;
export const GROUP_DISTANCE_PX = 80;

export interface MarkGroup {
  strokes: Stroke[];
  bounds: Rect;
  t0: number;
  t1: number;
}

/** Consecutive strokes drawn close in time and space form one mark (a circle plus its arrow). */
export function groupStrokes(strokes: Stroke[]): MarkGroup[] {
  const groups: MarkGroup[] = [];
  for (const s of [...strokes].sort((a, b) => a.t0 - b.t0)) {
    const last = groups.at(-1);
    if (last && s.t0 - last.t1 < GROUP_GAP_MS && rectGap(s.bounds, last.bounds) <= GROUP_DISTANCE_PX) {
      last.strokes.push(s);
      last.bounds = unionRects([last.bounds, s.bounds]);
      last.t1 = Math.max(last.t1, s.t1);
    } else {
      groups.push({ strokes: [s], bounds: s.bounds, t0: s.t0, t1: s.t1 });
    }
  }
  return groups;
}
```

`src/marks/classify.ts`:
```ts
import { boundsOf, distance, pathLength, rectCenter, segmentsCross, type Point } from '@/shared/geometry';
import type { Gesture } from '@/shared/types';
import type { Stroke, StrokeKind } from './types';

export type StrokeShape = 'circle' | 'arrow' | 'cross-out' | 'underline' | 'straight' | 'scribble';

export interface StrokeReading {
  shape: StrokeShape;
  tail?: Point;
  head?: Point;
}

export interface ClassifiedMark {
  gesture: Gesture;
  /** Enclosing outline, for circles. */
  loop?: Point[];
  /** Tail and head, for arrows (also kept when a circle comes with an arrow). */
  arrow?: { tail: Point; head: Point };
  wrote: string[];
  /** Contains pen strokes, so a picture of the ink says more than the shapes do. */
  freehand: boolean;
}

const MIN_STROKE_PX = 20;
const MIN_ARROW_PX = 40;
const REVERSAL_PX = 8;
/** Tool shapes that always mean "new UI here". */
const SKETCH_KINDS: ReadonlySet<StrokeKind> = new Set(['rectangle', 'line', 'other']);

/** Direction changes along one axis, ignoring wobble smaller than `threshold`. */
export function countReversals(values: number[], threshold: number): number {
  let dir = 0;
  let extreme = values[0] ?? 0;
  let reversals = 0;
  for (const v of values) {
    if (dir === 0) {
      if (Math.abs(v - extreme) >= threshold) {
        dir = Math.sign(v - extreme);
        extreme = v;
      }
    } else if ((v - extreme) * dir > 0) {
      extreme = v;
    } else if (Math.abs(v - extreme) >= threshold) {
      reversals++;
      dir = -dir;
      extreme = v;
    }
  }
  return reversals;
}

/** Classify one freehand pen stroke by its geometry (spec §5.1). */
export function classifyStroke(points: Point[]): StrokeReading {
  const length = pathLength(points);
  if (points.length < 2 || length < MIN_STROKE_PX) return { shape: 'scribble' };
  const start = points[0];
  const end = points[points.length - 1];
  const box = boundsOf(points);
  const xTurns = countReversals(points.map((p) => p.x), REVERSAL_PX);
  const yTurns = countReversals(points.map((p) => p.y), REVERSAL_PX);
  // A loop ends near its start and turns back on both axes (a zigzag only turns on one).
  if (distance(start, end) < 0.25 * length && box.w >= 16 && box.h >= 16 && xTurns >= 1 && yTurns >= 1) {
    return { shape: 'circle' };
  }
  const arrow = readOneStrokeArrow(points);
  if (arrow) return { shape: 'arrow', ...arrow };
  if (Math.max(xTurns, yTurns) >= 3) return { shape: 'cross-out' };
  const straightness = length / Math.max(1, distance(start, end));
  if (straightness <= 1.3 && box.h <= 0.15 * box.w) return { shape: 'underline' };
  if (straightness <= 1.15) return { shape: 'straight' };
  return { shape: 'scribble' };
}

/** A straight shaft to the farthest point, then a short head drawn around that tip. */
function readOneStrokeArrow(points: Point[]): { tail: Point; head: Point } | null {
  const start = points[0];
  let tipIndex = 0;
  points.forEach((p, i) => {
    if (distance(start, p) > distance(start, points[tipIndex])) tipIndex = i;
  });
  const tip = points[tipIndex];
  const chord = distance(start, tip);
  if (chord < MIN_ARROW_PX || tipIndex === points.length - 1) return null;
  if (pathLength(points.slice(0, tipIndex + 1)) / chord > 1.2) return null;
  const head = points.slice(tipIndex);
  const headLength = pathLength(head);
  if (headLength < 0.1 * chord || headLength > 1.2 * chord) return null;
  if (head.some((p) => distance(p, tip) > 0.4 * chord)) return null;
  return { tail: start, head: tip };
}

type Reading = StrokeReading & { stroke: Stroke; text?: true };

function readStroke(stroke: Stroke): Reading {
  const { points } = stroke;
  switch (stroke.kind) {
    case 'ellipse':
      return { stroke, shape: 'circle' };
    case 'arrow':
      return { stroke, shape: 'arrow', tail: points[0], head: points[points.length - 1] };
    case 'text':
    case 'note':
      return { stroke, shape: 'scribble', text: true };
    default:
      return { stroke, ...classifyStroke(points) };
  }
}

const isLine = (r: Reading) => !r.text && (r.shape === 'straight' || r.shape === 'underline');
const ends = (r: Reading): [Point, Point] => [r.stroke.points[0], r.stroke.points[r.stroke.points.length - 1]];
const chordOf = (r: Reading) => distance(...ends(r));

function angleBetween(a: Reading, b: Reading): number {
  const angle = (r: Reading) => {
    const [p, q] = ends(r);
    return ((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 180) % 180;
  };
  const diff = Math.abs(angle(a) - angle(b));
  return Math.min(diff, 180 - diff);
}

/** Two similar lines crossing at a wide angle: an X. */
function combineCrossOut(readings: Reading[]): Reading[] {
  const lines = readings.filter(isLine);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const ratio = chordOf(a) / Math.max(1, chordOf(b));
      if (ratio < 0.5 || ratio > 2 || angleBetween(a, b) < 45 || !segmentsCross(...ends(a), ...ends(b))) continue;
      return [...readings.filter((r) => r !== a && r !== b), { stroke: a.stroke, shape: 'cross-out' }];
    }
  }
  return readings;
}

/** A long line with one or two short strokes at one end: an arrow pointing at that end. */
function combineArrow(readings: Reading[]): Reading[] {
  for (const shaft of readings.filter(isLine)) {
    const [start, end] = ends(shaft);
    const chord = distance(start, end);
    if (chord < MIN_ARROW_PX) continue;
    for (const tip of [end, start]) {
      const heads = readings.filter(
        (r) =>
          r !== shaft &&
          !r.text &&
          r.shape !== 'circle' &&
          pathLength(r.stroke.points) <= 0.6 * chord &&
          distance(rectCenter(r.stroke.bounds), tip) <= 0.3 * chord + 10,
      );
      if (heads.length === 0 || heads.length > 2) continue;
      const tail = tip === end ? start : end;
      return [...readings.filter((r) => r !== shaft && !heads.includes(r)), { stroke: shaft.stroke, shape: 'arrow', tail, head: tip }];
    }
  }
  return readings;
}

/** Classify a whole mark (one group of strokes) into one gesture. */
export function classifyMark(strokes: Stroke[]): ClassifiedMark {
  const base = {
    wrote: strokes.flatMap((s) => (s.text ? [s.text] : [])),
    freehand: strokes.some((s) => s.kind === 'draw'),
  };
  if (strokes.some((s) => SKETCH_KINDS.has(s.kind))) return { gesture: 'sketch', ...base };
  const readings = combineArrow(combineCrossOut(strokes.map(readStroke))).filter((r) => !r.text);
  const circle = readings.find((r) => r.shape === 'circle');
  const arrowReading = readings.find((r) => r.shape === 'arrow');
  const arrow = arrowReading?.tail && arrowReading.head ? { tail: arrowReading.tail, head: arrowReading.head } : undefined;
  if (circle) return { gesture: 'circle', loop: circle.stroke.points, ...(arrow ? { arrow } : {}), ...base };
  if (readings.some((r) => r.shape === 'cross-out')) return { gesture: 'cross-out', ...base };
  if (arrow) return { gesture: 'arrow', arrow, ...base };
  if (readings.length > 0 && readings.every(isLine) && readings.some((r) => r.shape === 'underline')) {
    return { gesture: 'underline', ...base };
  }
  return { gesture: 'sketch', ...base };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/marks && npm run typecheck`
Expected: PASS. If a geometry threshold test fails, fix the implementation to match the spec thresholds in Global Constraints. Don't loosen the test.

- [ ] **Step 6: Commit**

```bash
git add src/marks
git commit -m "feat(marks): group strokes into marks and classify gestures"
```

---

### Task 5: Hit-testing marks against the page

**Files:**
- Create: `src/marks/hitTest.ts`, `src/marks/hitTest.test.ts`

**Interfaces:**
- Consumes: `ClassifiedMark` (Task 4). `PreviewElement` (Task 2). Geometry and types (Task 1).
- Produces: `HitPage { bounds: Rect; elements: PreviewElement[] }`, `HitResult { target: MarkTarget; pointsTo?: MarkTarget; unsure: boolean; highlights: Rect[] }`, `hitTest(mark, bounds, page): HitResult`, and the constants `CIRCLE_INSIDE = 0.7`, `LOW_CONFIDENCE = 0.4` and `MIN_TARGET_PX = 12`.

- [ ] **Step 1: Write the failing tests**

`src/marks/hitTest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boundsOf, type Point, type Rect } from '@/shared/geometry';
import type { MarkTarget } from '@/shared/types';
import type { ClassifiedMark } from './classify';
import { hitTest } from './hitTest';
import { loopAround, PAGE_BOUNDS, PAGE_ELEMENTS, rectOf, src } from './testing';

const page = { bounds: PAGE_BOUNDS, elements: PAGE_ELEMENTS };
const srcs = (t: MarkTarget | undefined) => (t?.kind === 'elements' ? t.elements.map((e) => e.src) : t?.kind);
const mark = (gesture: ClassifiedMark['gesture'], extra: Partial<ClassifiedMark> = {}): ClassifiedMark => ({
  gesture, wrote: [], freehand: true, ...extra,
});
const circle = (r: Rect) => {
  const loop = loopAround(r);
  return hitTest(mark('circle', { loop }), boundsOf(loop), page);
};
const arrow = (tail: Point, head: Point) => hitTest(mark('arrow', { arrow: { tail, head } }), boundsOf([tail, head]), page);

describe('hitTest: circle', () => {
  it('keeps only the outermost fully circled element', () => {
    expect(srcs(circle(rectOf(3)).target)).toEqual([src(3)]);
  });
  it('returns several siblings when only they are circled', () => {
    expect(srcs(circle({ x: 900, y: 24, w: 160, h: 24 }).target)).toEqual([src(4), src(5)]);
  });
  it('turns a loop around empty space into an unsure region', () => {
    const hit = circle({ x: 60, y: 440, w: 100, h: 60 });
    expect(hit.unsure).toBe(true);
    expect(hit.target.kind === 'region' && hit.target.region.inside?.src).toBe(src(7));
  });
  it('highlights what it hit', () => {
    expect(circle(rectOf(3)).highlights).toEqual([rectOf(3)]);
  });
});

describe('hitTest: arrow', () => {
  it('targets the smallest element under the head', () => {
    const hit = arrow({ x: 100, y: 400 }, { x: 600, y: 374 });
    expect(srcs(hit.target)).toEqual([src(10)]);
    expect(hit.pointsTo).toBeUndefined();
  });
  it('reads tail-on-A, head-on-B as "move A to B"', () => {
    const hit = arrow({ x: 1110, y: 36 }, { x: 640, y: 1200 });
    expect(srcs(hit.target)).toEqual([src(6)]);
    expect(srcs(hit.pointsTo)).toEqual([src(15)]);
  });
  it('is unsure when the head lands on nothing', () => {
    const hit = arrow({ x: 1000, y: 300 }, { x: 1500, y: 300 });
    expect(hit.unsure).toBe(true);
    expect(hit.target.kind === 'region' && hit.target.region.outside).toBe('right');
  });
});

describe('hitTest: circle with an arrow', () => {
  it('targets the circled element and points where the arrow ends', () => {
    const loop = loopAround(rectOf(12));
    const hit = hitTest(mark('circle', { loop, arrow: { tail: { x: 420, y: 850 }, head: { x: 1030, y: 850 } } }), boundsOf(loop), page);
    expect(srcs(hit.target)).toEqual([src(12)]);
    expect(srcs(hit.pointsTo)).toEqual([src(14)]);
  });
});

describe('hitTest: cross-out and underline', () => {
  it('crosses out the element the scribble covers', () => {
    const hit = hitTest(mark('cross-out'), { x: 490, y: 720, w: 300, h: 260 }, page);
    expect(srcs(hit.target)).toEqual([src(13)]);
  });
  it('underlines the text element just above the line', () => {
    const hit = hitTest(mark('underline'), { x: 360, y: 278, w: 560, h: 0 }, page);
    expect(srcs(hit.target)).toEqual([src(8)]);
  });
});

describe('hitTest: sketch regions', () => {
  it('places a region straddling two sections between them', () => {
    const hit = hitTest(mark('sketch'), { x: 40, y: 560, w: 1200, h: 100 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region).toMatchObject({ width: 1200, height: 100, left: 40, top: 560, fullWidth: true, outside: null, inside: null });
    expect(region?.elementAbove?.src).toBe(src(7));
    expect(region?.elementBelow?.src).toBe(src(11));
  });
  it('places a region inside a section, under the header', () => {
    const hit = hitTest(mark('sketch'), { x: 1000, y: 150, w: 200, h: 150 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region?.inside?.src).toBe(src(7));
    expect(region?.elementAbove?.src).toBe(src(1));
  });
  it('places a region below the page after the footer', () => {
    const hit = hitTest(mark('sketch'), { x: 100, y: 1450, w: 1000, h: 200 }, page);
    const region = hit.target.kind === 'region' ? hit.target.region : null;
    expect(region?.outside).toBe('below');
    expect(region?.elementAbove?.src).toBe(src(15));
  });
  it('lists elements a region mostly covers', () => {
    const hit = hitTest(mark('sketch'), { x: 850, y: 690, w: 370, h: 320 }, page);
    expect(hit.target.kind === 'region' && hit.target.region.covers.map((e) => e.src)).toEqual([src(14)]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/marks/hitTest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/marks/hitTest.ts`:
```ts
import type { PreviewElement } from '@/preview/previewMessages';
import {
  boundsOf,
  containsPoint,
  fractionInPolygon,
  horizontalOverlap,
  overlapArea,
  rectArea,
  rectBottom,
  rectCenter,
  rectRight,
  type Point,
  type Rect,
} from '@/shared/geometry';
import type { MarkTarget, RegionDescription, TargetElement } from '@/shared/types';
import type { ClassifiedMark } from './classify';

export const CIRCLE_INSIDE = 0.7;
export const LOW_CONFIDENCE = 0.4;
export const MIN_TARGET_PX = 12;
const MAX_COVERS = 8;
const UNDERLINE_REACH_PX = 30;
const ARROW_HEAD_BOX_PX = 40;
const TIE_PX = 4;

export interface HitPage {
  bounds: Rect;
  /** Page coordinates. */
  elements: PreviewElement[];
}

export interface HitResult {
  target: MarkTarget;
  pointsTo?: MarkTarget;
  unsure: boolean;
  /** Page rects to outline on the canvas. */
  highlights: Rect[];
}

/** Resolve a classified mark to the page elements (or new region) it means (spec §5.2). */
export function hitTest(mark: ClassifiedMark, bounds: Rect, page: HitPage): HitResult {
  switch (mark.gesture) {
    case 'circle': {
      const hit = circled(page, mark.loop ?? outline(bounds));
      return mark.arrow ? withPointsTo(hit, pointedAt(page, mark.arrow.head)) : hit;
    }
    case 'arrow':
      return mark.arrow ? arrowHit(page, mark.arrow.tail, mark.arrow.head) : regionHit(page, bounds, true);
    case 'cross-out':
      return crossedOut(page, bounds);
    case 'underline':
      return underlined(page, bounds);
    case 'sketch':
      return regionHit(page, bounds, false);
  }
}

type Els = PreviewElement[];
const indexes = (els: Els) => els.map((_, i) => i);
const toTarget = (e: PreviewElement): TargetElement => ({ src: e.src, tag: e.tag, text: e.text });
const bySmallest = (els: Els) => (a: number, b: number) => rectArea(els[a].rect) - rectArea(els[b].rect);

function isAncestor(els: Els, ancestor: number, i: number): boolean {
  for (let p = els[i].parent; p >= 0; p = els[p].parent) if (p === ancestor) return true;
  return false;
}

function depth(els: Els, i: number): number {
  let d = 0;
  for (let p = els[i].parent; p >= 0; p = els[p].parent) d++;
  return d;
}

const related = (els: Els, a: number, b: number) => a === b || isAncestor(els, a, b) || isAncestor(els, b, a);

/** Drop any candidate whose ancestor is also a candidate. */
function outermost(els: Els, idx: number[]): number[] {
  return idx.filter((i) => !idx.some((j) => j !== i && isAncestor(els, j, i)));
}

function smallestAt(els: Els, p: Point): number | null {
  const hits = indexes(els).filter(
    (i) => els[i].rect.w >= MIN_TARGET_PX && els[i].rect.h >= MIN_TARGET_PX && containsPoint(els[i].rect, p),
  );
  return hits.sort(bySmallest(els))[0] ?? null;
}

function outline(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: rectRight(r), y: r.y },
    { x: rectRight(r), y: rectBottom(r) },
    { x: r.x, y: rectBottom(r) },
  ];
}

function elementsHit(els: Els, idx: number[], unsure = false): HitResult {
  return { target: { kind: 'elements', elements: idx.map((i) => toTarget(els[i])) }, unsure, highlights: idx.map((i) => els[i].rect) };
}

function regionHit(page: HitPage, r: Rect, unsure: boolean): HitResult {
  return { target: { kind: 'region', region: describeRegion(page, r) }, unsure, highlights: [r] };
}

function withPointsTo(hit: HitResult, to: HitResult): HitResult {
  return { target: hit.target, pointsTo: to.target, unsure: hit.unsure || to.unsure, highlights: [...hit.highlights, ...to.highlights] };
}

function circled(page: HitPage, loop: Point[]): HitResult {
  const els = page.elements;
  const fractions = els.map((e) => fractionInPolygon(e.rect, loop));
  const inside = outermost(els, indexes(els).filter((i) => rectArea(els[i].rect) > 0 && fractions[i] >= CIRCLE_INSIDE));
  if (inside.length > 0) return elementsHit(els, inside);
  // Nothing fully circled: the element the loop covers best, smallest on ties.
  const best = indexes(els)
    .filter((i) => fractions[i] > 0)
    .sort((a, b) => fractions[b] - fractions[a] || rectArea(els[a].rect) - rectArea(els[b].rect))[0];
  if (best !== undefined && fractions[best] >= LOW_CONFIDENCE) return elementsHit(els, [best]);
  return regionHit(page, boundsOf(loop), true);
}

function pointedAt(page: HitPage, head: Point): HitResult {
  const i = smallestAt(page.elements, head);
  if (i !== null) return elementsHit(page.elements, [i]);
  const half = ARROW_HEAD_BOX_PX / 2;
  return regionHit(page, { x: head.x - half, y: head.y - half, w: ARROW_HEAD_BOX_PX, h: ARROW_HEAD_BOX_PX }, true);
}

function arrowHit(page: HitPage, tail: Point, head: Point): HitResult {
  const els = page.elements;
  const from = smallestAt(els, tail);
  const to = smallestAt(els, head);
  // Tail on one element and head on an unrelated one: "move this there".
  if (from !== null && to !== null && !related(els, from, to)) {
    return withPointsTo(elementsHit(els, [from]), elementsHit(els, [to]));
  }
  return pointedAt(page, head);
}

function crossedOut(page: HitPage, box: Rect): HitResult {
  const els = page.elements;
  const covered = outermost(
    els,
    indexes(els).filter((i) => rectArea(els[i].rect) > 0 && overlapArea(els[i].rect, box) >= CIRCLE_INSIDE * rectArea(els[i].rect)),
  );
  if (covered.length > 0) return elementsHit(els, covered);
  const holder = indexes(els)
    .filter((i) => rectArea(box) > 0 && overlapArea(els[i].rect, box) >= 0.6 * rectArea(box))
    .sort(bySmallest(els))[0];
  if (holder !== undefined) return elementsHit(els, [holder]);
  const atCenter = smallestAt(els, rectCenter(box));
  return atCenter !== null ? elementsHit(els, [atCenter], true) : regionHit(page, box, true);
}

function underlined(page: HitPage, box: Rect): HitResult {
  const els = page.elements;
  const above = indexes(els)
    .filter((i) => {
      const r = els[i].rect;
      return (
        r.h <= 200 &&
        rectBottom(r) >= box.y - UNDERLINE_REACH_PX &&
        rectBottom(r) <= rectBottom(box) + 6 &&
        horizontalOverlap(r, box) >= 0.5 * Math.min(r.w, box.w)
      );
    })
    .sort(bySmallest(els));
  const pick = above.find((i) => els[i].text !== '') ?? above[0];
  if (pick !== undefined) return elementsHit(els, [pick]);
  return { ...crossedOut(page, box), unsure: true };
}

/** Among near-ties at the edge closest to the region, the outermost element. */
function nearest(els: Els, idx: number[], edge: (i: number) => number, want: 'max' | 'min'): number | undefined {
  if (idx.length === 0) return undefined;
  const values = idx.map(edge);
  const best = want === 'max' ? Math.max(...values) : Math.min(...values);
  return idx.filter((i) => Math.abs(edge(i) - best) <= TIE_PX).sort((a, b) => depth(els, a) - depth(els, b))[0];
}

function describeRegion(page: HitPage, r: Rect): RegionDescription {
  const els = page.elements;
  const p = page.bounds;
  // Page-sized wrappers (<main>, the root div) say nothing about where the region is.
  const usable = indexes(els).filter((i) => rectArea(els[i].rect) > 0 && els[i].rect.h < 0.9 * p.h);
  const covered = outermost(els, usable.filter((i) => overlapArea(els[i].rect, r) >= CIRCLE_INSIDE * rectArea(els[i].rect)));
  const free = usable.filter((i) => !covered.some((c) => c === i || isAncestor(els, c, i)));
  const inside = free
    .filter((i) => rectArea(r) > 0 && overlapArea(els[i].rect, r) >= 0.9 * rectArea(r))
    .sort(bySmallest(els))[0];
  const beside = free.filter((i) => horizontalOverlap(els[i].rect, r) >= 0.5 * Math.min(els[i].rect.w, r.w));
  const above = nearest(
    els,
    beside.filter((i) => els[i].rect.y < r.y && rectBottom(els[i].rect) < rectBottom(r)),
    (i) => rectBottom(els[i].rect),
    'max',
  );
  const below = nearest(
    els,
    beside.filter((i) => els[i].rect.y > r.y && rectBottom(els[i].rect) > rectBottom(r)),
    (i) => els[i].rect.y,
    'min',
  );
  const outside =
    rectRight(r) <= p.x ? 'left' : r.x >= rectRight(p) ? 'right' : rectBottom(r) <= p.y ? 'above' : r.y >= rectBottom(p) ? 'below' : null;
  return {
    width: Math.round(r.w),
    height: Math.round(r.h),
    left: Math.round(r.x - p.x),
    top: Math.round(r.y - p.y),
    fullWidth: r.w >= 0.8 * p.w,
    outside,
    inside: inside !== undefined ? toTarget(els[inside]) : null,
    elementAbove: above !== undefined ? toTarget(els[above]) : null,
    elementBelow: below !== undefined ? toTarget(els[below]) : null,
    covers: covered.slice(0, MAX_COVERS).map((i) => toTarget(els[i])),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/marks && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/marks
git commit -m "feat(marks): hit-test marks against the page's element map"
```

---

### Task 6: Planning an edit, mark labels, and the targeting eval

**Files:**
- Create: `src/marks/planEdit.ts`, `src/marks/planEdit.test.ts`, `src/marks/describeMark.ts`, `src/marks/describeMark.test.ts`, `src/marks/evals/score.ts`, `src/marks/evals/goldenCases.ts`, `src/marks/evals/targeting.test.ts`, `src/marks/evals/cases/.gitkeep`

**Interfaces:**
- Consumes: `groupStrokes` (Task 4), `classifyMark` (Task 4), `hitTest`/`HitResult` (Task 5), `parseSrc`/`targetElements` (Task 1), and `FrameInfo`/`Stroke` (Task 3).
- Produces:
  - `planEdit.ts`: `FRAME_REACH_PX = 300`, `PlannedMark { n; shapeIds: string[]; bounds: Rect; gesture: Gesture; hit: HitResult; wrote: string[]; freehand: boolean }`, `EditPlan { frameId: string; marks: PlannedMark[] }`, `PlanResult = { ok: true; plan } | { ok: false; reason: 'no-marks' | 'no-frame' | 'loading'; message }`, `planEdit(strokes, frames, selectedFrameId): PlanResult`, `planShapeIds(plan): string[]`, `needsInk(mark): boolean`, `toSegment(mark, inkPng?): Segment`, `circled(n): string` and `statusLine(plan): string`.
  - `describeMark.ts`: `describeMark(mark: PlannedMark): string`.
  - `evals/score.ts`: `EvalExpectation`, `EvalCase`, `targetKey(t)`, `expectationsFor(plan)` and `scoreCase(c)`.

- [ ] **Step 1: Write the failing tests**

`src/marks/planEdit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { circled, needsInk, planEdit, planShapeIds, statusLine, toSegment } from './planEdit';
import { line, loopAround, PAGE, PAGE_BOUNDS, rectOf, src, stroke, zigzag } from './testing';
import type { FrameInfo } from './types';

const other: FrameInfo = { id: 'shape:other', bounds: { x: 3000, y: 0, w: 1280, h: 800 }, elements: [] };

describe('planEdit', () => {
  it('numbers marks on the nearest page in time order', () => {
    const nav = stroke('draw', loopAround(rectOf(3)), 0);
    const card = stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 3000);
    const result = planEdit([card, nav], [PAGE, other], null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.frameId).toBe(PAGE.id);
    expect(result.plan.marks.map((m) => [m.n, m.gesture])).toEqual([[1, 'circle'], [2, 'cross-out']]);
    expect(planShapeIds(result.plan)).toEqual([nav.shapeId, card.shapeId]);
  });
  it('targets the page with the most marks and leaves the others pending', () => {
    const a = stroke('draw', loopAround(rectOf(3)), 0);
    const b = stroke('draw', loopAround({ x: 3100, y: 100, w: 100, h: 40 }), 3000);
    const c = stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 6000);
    const result = planEdit([a, b, c], [PAGE, other], null);
    expect(result.ok && result.plan.marks.flatMap((m) => m.shapeIds)).toEqual([a.shapeId, c.shapeId]);
  });
  it('ignores marks far from every page', () => {
    const far = stroke('draw', loopAround({ x: 9000, y: 9000, w: 100, h: 50 }));
    expect(planEdit([far], [PAGE], null)).toMatchObject({ ok: false, reason: 'no-frame' });
  });
  it('waits for the element map instead of guessing', () => {
    const loading = { ...PAGE, elements: null };
    expect(planEdit([stroke('draw', loopAround(rectOf(3)))], [loading], null)).toMatchObject({ ok: false, reason: 'loading' });
  });
  it('allows a whole-page instruction on a selected page with no marks', () => {
    expect(planEdit([], [PAGE], PAGE.id)).toEqual({ ok: true, plan: { frameId: PAGE.id, marks: [] } });
    expect(planEdit([], [PAGE], null)).toMatchObject({ ok: false, reason: 'no-marks' });
  });
});

describe('segments and status', () => {
  const result = planEdit(
    [stroke('draw', loopAround(rectOf(3)), 0), stroke('rectangle', line({ x: 40, y: 560 }, { x: 1240, y: 660 }), 3000)],
    [{ ...PAGE, bounds: PAGE_BOUNDS }],
    null,
  );
  if (!result.ok) throw new Error('plan failed');
  const [nav, sketch] = result.plan.marks;

  it('builds a segment from a mark', () => {
    expect(toSegment(nav)).toEqual({
      n: 1, gesture: 'circle', target: { kind: 'elements', elements: [{ src: src(3), tag: 'nav', text: 'Product Pricing Blog' }] },
      unsure: false, wrote: [],
    });
    expect(toSegment(nav, 'PNG').inkPng).toBe('PNG');
  });
  it('asks for ink only for unsure marks and freehand sketches', () => {
    expect(needsInk(nav)).toBe(false);
    expect(needsInk(sketch)).toBe(false);
    expect(needsInk({ ...sketch, freehand: true })).toBe(true);
    expect(needsInk({ ...nav, hit: { ...nav.hit, unsure: true } })).toBe(true);
  });
  it('summarises what is being edited', () => {
    expect(circled(1)).toBe('①');
    expect(statusLine(result.plan)).toBe('Understood ①② → editing Header.tsx, Hero.tsx, Features.tsx…');
    expect(statusLine({ frameId: PAGE.id, marks: [] })).toBe('Editing the whole page…');
  });
});
```

`src/marks/describeMark.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeMark } from './describeMark';
import { planEdit } from './planEdit';
import { loopAround, PAGE, rectOf, rectOutline, stroke } from './testing';

function marks(...strokes: Parameters<typeof planEdit>[0]) {
  const result = planEdit(strokes, [PAGE], null);
  if (!result.ok) throw new Error(result.message);
  return result.plan.marks;
}

describe('describeMark', () => {
  it('names the element, its text and its source line', () => {
    expect(describeMark(marks(stroke('draw', loopAround(rectOf(3))))[0])).toBe('Circled <nav> “Product Pricing Blog” · Header.tsx:5');
  });
  it('counts extra elements', () => {
    expect(describeMark(marks(stroke('draw', loopAround({ x: 900, y: 24, w: 160, h: 24 })))[0])).toBe(
      'Circled <a> “Product” · Header.tsx:6 +1 more',
    );
  });
  it('describes a sketched region by its neighbours and written words', () => {
    const [mark] = marks(
      stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 }), 0),
      stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 100, 'Testimonials'),
    );
    expect(describeMark(mark)).toBe('Sketched new UI below <section> “Testimonials”');
  });
});
```

`src/marks/evals/targeting.test.ts`:
```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES } from './goldenCases';
import { scoreCase, type EvalCase } from './score';

const CASES_DIR = path.join(import.meta.dirname, 'cases');

function recordedCases(): EvalCase[] {
  if (!existsSync(CASES_DIR)) return [];
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(path.join(CASES_DIR, f), 'utf8')) as EvalCase);
}

describe('targeting eval (spec §9.2, measured without AI)', () => {
  it.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('golden: %s', (_, c) => {
    expect(scoreCase(c).failures).toEqual([]);
  });
  it('resolves at least 90% of all marks, recorded ones included', () => {
    const scores = [...GOLDEN_CASES, ...recordedCases()].map(scoreCase);
    const correct = scores.reduce((n, s) => n + s.correct, 0);
    const total = scores.reduce((n, s) => n + s.total, 0);
    expect(correct / total, scores.flatMap((s) => s.failures).join('\n')).toBeGreaterThanOrEqual(0.9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/marks`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/marks/planEdit.ts`:
```ts
import { rectGap, type Rect } from '@/shared/geometry';
import { parseSrc, targetElements } from '@/shared/targets';
import type { Gesture, Segment } from '@/shared/types';
import { classifyMark } from './classify';
import { groupStrokes, type MarkGroup } from './groupStrokes';
import { hitTest, type HitResult } from './hitTest';
import type { FrameInfo, Stroke } from './types';

/** Marks further than this from every page are ignored (they are sketches or notes). */
export const FRAME_REACH_PX = 300;

export interface PlannedMark {
  n: number;
  shapeIds: string[];
  bounds: Rect;
  gesture: Gesture;
  hit: HitResult;
  wrote: string[];
  freehand: boolean;
}

export interface EditPlan {
  frameId: string;
  marks: PlannedMark[];
}

export type PlanResult =
  | { ok: true; plan: EditPlan }
  | { ok: false; reason: 'no-marks' | 'no-frame' | 'loading'; message: string };

/** Turn pending strokes into a numbered edit plan for one page. Pure: the panel shows exactly what gets sent. */
export function planEdit(strokes: Stroke[], frames: FrameInfo[], selectedFrameId: string | null): PlanResult {
  const groups = groupStrokes(strokes);
  const owners = groups.map((g) => nearestFrame(g, frames));
  const frame = busiestFrame(owners) ?? frames.find((f) => f.id === selectedFrameId);
  if (!frame) {
    return groups.length > 0
      ? { ok: false, reason: 'no-frame', message: 'Draw on or next to a page to change it.' }
      : { ok: false, reason: 'no-marks', message: 'Circle, point at, cross out, underline or sketch on a page, then say what to change.' };
  }
  const mine = groups.filter((_, i) => owners[i] === frame);
  if (mine.length > 0 && frame.elements === null) {
    return { ok: false, reason: 'loading', message: 'The page is still loading. Try again in a moment.' };
  }
  const page = { bounds: frame.bounds, elements: frame.elements ?? [] };
  const marks = mine.map((group, i): PlannedMark => {
    const mark = classifyMark(group.strokes);
    return {
      n: i + 1,
      shapeIds: group.strokes.map((s) => s.shapeId),
      bounds: group.bounds,
      gesture: mark.gesture,
      hit: hitTest(mark, group.bounds, page),
      wrote: mark.wrote,
      freehand: mark.freehand,
    };
  });
  return { ok: true, plan: { frameId: frame.id, marks } };
}

function nearestFrame(group: MarkGroup, frames: FrameInfo[]): FrameInfo | undefined {
  let best: FrameInfo | undefined;
  let bestGap = FRAME_REACH_PX;
  for (const frame of frames) {
    const gap = rectGap(group.bounds, frame.bounds);
    if (gap <= bestGap) {
      best = frame;
      bestGap = gap;
    }
  }
  return best;
}

/** The page owning the most marks; on a tie, the one with the most recent mark. */
function busiestFrame(owners: Array<FrameInfo | undefined>): FrameInfo | undefined {
  const counts = new Map<FrameInfo, number>();
  for (const f of owners) if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  let best: FrameInfo | undefined;
  for (let i = owners.length - 1; i >= 0; i--) {
    const f = owners[i];
    if (f && (!best || counts.get(f)! > counts.get(best)!)) best = f;
  }
  return best;
}

/** The shapes this plan consumes; strokes drawn after planning are not included. */
export function planShapeIds(plan: EditPlan): string[] {
  return plan.marks.flatMap((m) => m.shapeIds);
}

/** A picture of the ink helps when the geometry alone is ambiguous. */
export function needsInk(mark: PlannedMark): boolean {
  return mark.hit.unsure || (mark.gesture === 'sketch' && mark.freehand);
}

export function toSegment(mark: PlannedMark, inkPng?: string): Segment {
  return {
    n: mark.n,
    gesture: mark.gesture,
    target: mark.hit.target,
    ...(mark.hit.pointsTo ? { pointsTo: mark.hit.pointsTo } : {}),
    unsure: mark.hit.unsure,
    wrote: mark.wrote,
    ...(inkPng ? { inkPng } : {}),
  };
}

export const circled = (n: number): string => (n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : `(${n})`);

const fileName = (src: string) => parseSrc(src)?.path.split('/').pop();

export function statusLine(plan: EditPlan): string {
  if (plan.marks.length === 0) return 'Editing the whole page…';
  const targets = plan.marks.flatMap((m) => (m.hit.pointsTo ? [m.hit.target, m.hit.pointsTo] : [m.hit.target]));
  const files = [...new Set(targets.flatMap(targetElements).flatMap((e) => fileName(e.src) ?? []))];
  return `Understood ${plan.marks.map((m) => circled(m.n)).join('')} → editing ${files.length > 0 ? files.join(', ') : 'the page'}…`;
}
```

`src/marks/describeMark.ts`:
```ts
import { parseSrc } from '@/shared/targets';
import type { Gesture, MarkTarget, RegionDescription, TargetElement } from '@/shared/types';
import type { PlannedMark } from './planEdit';

const VERB: Record<Gesture, string> = {
  circle: 'Circled',
  arrow: 'Pointed at',
  'cross-out': 'Crossed out',
  underline: 'Underlined',
  sketch: 'Sketched new UI',
};

/** One line for the panel: what the mark hit, so a misread is visible before it costs anything. */
export function describeMark(mark: PlannedMark): string {
  const main = describeTarget(mark.gesture, mark.hit.target);
  const to = mark.hit.pointsTo ? ` → ${shortTarget(mark.hit.pointsTo)}` : '';
  const wrote = mark.wrote.length > 0 ? ` “${mark.wrote.join(' ')}”` : '';
  return `${main}${to}${wrote}${mark.hit.unsure ? ' (unsure)' : ''}`;
}

function describeTarget(gesture: Gesture, target: MarkTarget): string {
  if (target.kind === 'elements') {
    const [first, ...rest] = target.elements;
    const more = rest.length > 0 ? ` +${rest.length} more` : '';
    return `${VERB[gesture]} ${first ? elementLabel(first) : 'nothing'}${more}`;
  }
  return `${gesture === 'sketch' ? VERB.sketch : `${VERB[gesture]} an area`}${regionLabel(target.region)}`;
}

function shortTarget(target: MarkTarget): string {
  if (target.kind === 'elements') return target.elements[0] ? elementLabel(target.elements[0]) : 'nothing';
  return `an area${regionLabel(target.region)}`;
}

function elementLabel(e: TargetElement): string {
  const where = parseSrc(e.src);
  const text = e.text ? ` “${e.text.length > 24 ? `${e.text.slice(0, 23)}…` : e.text}”` : '';
  return `<${e.tag}>${text}${where ? ` · ${where.path.split('/').pop()}:${where.line}` : ''}`;
}

function regionLabel(r: RegionDescription): string {
  if (r.outside === 'above' || r.outside === 'below') return ` ${r.outside} the page`;
  if (r.outside) return ` ${r.outside} of the page`;
  const parts: string[] = [];
  if (r.inside) parts.push(`inside <${r.inside.tag}>`);
  if (r.elementAbove) parts.push(`below <${r.elementAbove.tag}>`);
  else if (r.elementBelow) parts.push(`above <${r.elementBelow.tag}>`);
  return parts.length > 0 ? ` ${parts.join(', ')}` : '';
}
```

`src/marks/evals/score.ts`:
```ts
import type { Gesture, MarkTarget } from '@/shared/types';
import { planEdit, type EditPlan } from '../planEdit';
import type { FrameInfo, Stroke } from '../types';

export interface EvalExpectation {
  n: number;
  gesture: Gesture;
  /** data-src of each targeted element (any order), or ["region"] for a new region. */
  targets: string[];
  pointsTo?: string[];
}

/** One recorded or synthetic instruction: board state in, expected marks out. */
export interface EvalCase {
  name: string;
  frames: FrameInfo[];
  strokes: Stroke[];
  selectedFrameId: string | null;
  expected: EvalExpectation[];
}

export function targetKey(target: MarkTarget): string[] {
  return target.kind === 'region' ? ['region'] : target.elements.map((e) => e.src).sort();
}

export function expectationsFor(plan: EditPlan): EvalExpectation[] {
  return plan.marks.map((m) => ({
    n: m.n,
    gesture: m.gesture,
    targets: targetKey(m.hit.target),
    ...(m.hit.pointsTo ? { pointsTo: targetKey(m.hit.pointsTo) } : {}),
  }));
}

const normalize = (e: EvalExpectation) =>
  JSON.stringify({ n: e.n, gesture: e.gesture, targets: [...e.targets].sort(), pointsTo: e.pointsTo ? [...e.pointsTo].sort() : null });

export function scoreCase(c: EvalCase): { correct: number; total: number; failures: string[] } {
  const result = planEdit(c.strokes, c.frames, c.selectedFrameId);
  const actual = result.ok ? expectationsFor(result.plan) : [];
  const failures: string[] = [];
  let correct = 0;
  for (const want of c.expected) {
    const got = actual.find((a) => a.n === want.n);
    if (got && normalize(got) === normalize(want)) correct++;
    else failures.push(`${c.name} #${want.n}: expected ${normalize(want)}, got ${got ? normalize(got) : result.ok ? 'no such mark' : result.message}`);
  }
  return { correct, total: c.expected.length, failures };
}
```

`src/marks/evals/goldenCases.ts`:
```ts
import { arrowHead, arrowStroke, line, loopAround, PAGE, rectOf, rectOutline, src, stroke, zigzag } from '../testing';
import type { EvalCase } from './score';

const one = (name: string, strokes: EvalCase['strokes'], expected: EvalCase['expected']): EvalCase => ({
  name, frames: [PAGE], strokes, selectedFrameId: null, expected,
});

/** Synthetic starter golden set; real recordings go in ./cases (Task 12). */
export const GOLDEN_CASES: EvalCase[] = [
  one('pen circle around the nav', [stroke('draw', loopAround(rectOf(3)))], [{ n: 1, gesture: 'circle', targets: [src(3)] }]),
  one('tool ellipse around two links', [stroke('ellipse', loopAround({ x: 900, y: 24, w: 160, h: 24 }))], [
    { n: 1, gesture: 'circle', targets: [src(4), src(5)] },
  ]),
  one('one-stroke arrow at the button', [stroke('draw', arrowStroke({ x: 200, y: 480 }, { x: 600, y: 374 }))], [
    { n: 1, gesture: 'arrow', targets: [src(10)] },
  ]),
  one('shaft plus head at the button', [
    stroke('draw', line({ x: 200, y: 480 }, { x: 600, y: 374 }), 0),
    stroke('draw', arrowHead({ x: 200, y: 480 }, { x: 600, y: 374 }), 500),
  ], [{ n: 1, gesture: 'arrow', targets: [src(10)] }]),
  one('tool arrow moving Blog to the footer', [stroke('arrow', [{ x: 1110, y: 36 }, { x: 640, y: 1200 }])], [
    { n: 1, gesture: 'arrow', targets: [src(6)], pointsTo: [src(15)] },
  ]),
  one('zigzag over the middle card', [stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }))], [
    { n: 1, gesture: 'cross-out', targets: [src(13)] },
  ]),
  one('X over the right card', [
    stroke('draw', line({ x: 880, y: 720 }, { x: 1180, y: 980 }), 0),
    stroke('draw', line({ x: 1180, y: 720 }, { x: 880, y: 980 }), 300),
  ], [{ n: 1, gesture: 'cross-out', targets: [src(14)] }]),
  one('underline the headline', [stroke('draw', line({ x: 360, y: 278 }, { x: 920, y: 278 }))], [
    { n: 1, gesture: 'underline', targets: [src(8)] },
  ]),
  one('boxed sketch between hero and features', [
    stroke('rectangle', rectOutline({ x: 40, y: 560, w: 1200, h: 100 }), 0),
    stroke('text', rectOutline({ x: 500, y: 590, w: 120, h: 30 }), 200, 'Testimonials'),
  ], [{ n: 1, gesture: 'sketch', targets: ['region'] }]),
  one('two marks in one instruction', [
    stroke('draw', loopAround(rectOf(3)), 0),
    stroke('draw', zigzag({ x: 490, y: 720, w: 300, h: 260 }), 3000),
  ], [
    { n: 1, gesture: 'circle', targets: [src(3)] },
    { n: 2, gesture: 'cross-out', targets: [src(13)] },
  ]),
];
```

Create the empty directory marker: `src/marks/evals/cases/.gitkeep` (empty file).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/marks && npm run typecheck`
Expected: PASS, with all 10 golden cases green and accuracy at 1.0.

- [ ] **Step 5: Commit**

```bash
git add src/marks
git commit -m "feat(marks): plan numbered edits and gate targeting accuracy with a golden set"
```

---

### Task 7: Parsing and applying edit blocks

**Files:**
- Modify: `src/server/build/parseFiles.ts` (export `normalizePath` and `cleanBody`, and use `normalizePath` inside `parseFiles`)
- Create: `src/server/edit/parseOps.ts`, `src/server/edit/parseOps.test.ts`, `src/server/edit/applyOps.ts`, `src/server/edit/applyOps.test.ts`

**Interfaces:**
- Consumes: `ENTRY_FILE` from `src/preview/compileProject.ts`, and `ProjectFiles`.
- Produces: `FileOp = { type: 'edit'; path; old; new } | { type: 'write'; path; content } | { type: 'delete'; path }`, `parseOps(text): FileOp[]`, `replaceOnce(source, old, replacement): string | { error: string }` and `applyOps(files, ops): { files: ProjectFiles; errors: string[] }`, where each error starts with `path: `.

- [ ] **Step 1: Write the failing tests**

`src/server/edit/parseOps.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseOps } from './parseOps';

describe('parseOps', () => {
  it('reads edit, file and delete blocks in order', () => {
    const text = `<edit path="./components/Header.tsx">
<old>
      <nav className="flex gap-8 text-sm">
</old>
<new>
      <nav className="flex gap-4 text-xs">
</new>
</edit>
<file path="components/Quote.tsx">
export default function Quote() { return <p>Hi</p>; }
</file>
<delete path="components/Old.tsx"/>
<summary>Smaller nav.</summary>`;
    expect(parseOps(text)).toEqual([
      { type: 'edit', path: 'components/Header.tsx', old: '      <nav className="flex gap-8 text-sm">', new: '      <nav className="flex gap-4 text-xs">' },
      { type: 'write', path: 'components/Quote.tsx', content: 'export default function Quote() { return <p>Hi</p>; }\n' },
      { type: 'delete', path: 'components/Old.tsx' },
    ]);
  });
  it('keeps inner whitespace of one-line blocks', () => {
    expect(parseOps('<edit path="App.tsx"><old>a  b</old><new> c </new></edit>')).toEqual([
      { type: 'edit', path: 'App.tsx', old: 'a  b', new: ' c ' },
    ]);
  });
  it('returns nothing for prose', () => {
    expect(parseOps('I would change the header.')).toEqual([]);
  });
});
```

`src/server/edit/applyOps.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyOps, replaceOnce } from './applyOps';

const HEADER = `export default function Header() {
  return (
    <header>
      <nav className="gap-8">Links</nav>
    </header>
  );
}
`;

describe('replaceOnce', () => {
  it('replaces an exact unique match, keeping $ patterns literal', () => {
    expect(replaceOnce('a $1 b', '$1', '$&$&')).toBe('a $&$& b');
  });
  it('rejects empty, missing and ambiguous quotes', () => {
    expect(replaceOnce('abc', '  ', 'x')).toEqual({ error: expect.stringContaining('empty') });
    expect(replaceOnce('abc', 'zzz', 'x')).toEqual({ error: expect.stringContaining('not found') });
    expect(replaceOnce('ab ab', 'ab', 'x')).toEqual({ error: expect.stringContaining('2 places') });
  });
  it('matches whole lines despite wrong indentation', () => {
    const result = replaceOnce(HEADER, '<nav className="gap-8">Links</nav>\n  </header>', '      <nav className="gap-2">Links</nav>\n    </header>');
    expect(result).toBe(HEADER.replace('gap-8', 'gap-2'));
  });
});

describe('applyOps', () => {
  const files = { 'App.tsx': 'app\n', 'components/Header.tsx': HEADER };
  it('applies edits, writes and deletes', () => {
    const result = applyOps(files, [
      { type: 'edit', path: 'components/Header.tsx', old: 'gap-8', new: 'gap-2' },
      { type: 'write', path: 'components/New.tsx', content: 'new\n' },
      { type: 'delete', path: 'components/Header.tsx' },
    ]);
    expect(result).toEqual({ files: { 'App.tsx': 'app\n', 'components/New.tsx': 'new\n' }, errors: [] });
  });
  it('keeps successful ops and reports failed ones with their path', () => {
    const result = applyOps(files, [
      { type: 'edit', path: 'components/Header.tsx', old: 'gap-8', new: 'gap-2' },
      { type: 'edit', path: 'components/Header.tsx', old: 'missing', new: 'x' },
      { type: 'edit', path: 'components/Nope.tsx', old: 'a', new: 'b' },
      { type: 'delete', path: 'App.tsx' },
    ]);
    expect(result.files['components/Header.tsx']).toContain('gap-2');
    expect(result.errors).toEqual([
      expect.stringMatching(/^components\/Header\.tsx: .*not found/),
      expect.stringMatching(/^components\/Nope\.tsx: .*does not exist/),
      expect.stringMatching(/^App\.tsx: .*can't be deleted/),
    ]);
    expect(files['components/Header.tsx']).toContain('gap-8');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/server/edit`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/server/build/parseFiles.ts`: export the two helpers and reuse `normalizePath`:
```ts
export function normalizePath(path: string): string {
  return path.trim().replace(/^\.?\//, '');
}
```
In `parseFiles`, replace `rawPath.trim().replace(/^\.?\//, '')` with `normalizePath(rawPath)`, and change `function cleanBody` to `export function cleanBody`.

`src/server/edit/parseOps.ts`:
```ts
import { cleanBody, normalizePath } from '@/server/build/parseFiles';

export type FileOp =
  | { type: 'edit'; path: string; old: string; new: string }
  | { type: 'write'; path: string; content: string }
  | { type: 'delete'; path: string };

const OP_RE =
  /<edit path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/edit>|<file path="([^"]+)">([\s\S]*?)<\/file>|<delete path="([^"]+)"\s*\/>/g;

/** Read the model's change blocks, in the order written. */
export function parseOps(text: string): FileOp[] {
  const ops: FileOp[] = [];
  for (const m of text.matchAll(OP_RE)) {
    if (m[1] !== undefined) ops.push({ type: 'edit', path: normalizePath(m[1]), old: trimBlock(m[2]), new: trimBlock(m[3]) });
    else if (m[4] !== undefined) ops.push({ type: 'write', path: normalizePath(m[4]), content: cleanBody(m[5]) });
    else ops.push({ type: 'delete', path: normalizePath(m[6]) });
  }
  return ops;
}

/** Drop the newline right after <old>/<new> and right before the closing tag; keep everything else. */
function trimBlock(block: string): string {
  return block.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
}
```

`src/server/edit/applyOps.ts`:
```ts
import { ENTRY_FILE } from '@/preview/compileProject';
import type { ProjectFiles } from '@/shared/types';
import type { FileOp } from './parseOps';

/**
 * Apply ops in order. Ops that fail are skipped and reported ("path: problem") so a fix round can
 * resend just those against the current files.
 */
export function applyOps(files: ProjectFiles, ops: FileOp[]): { files: ProjectFiles; errors: string[] } {
  const next = { ...files };
  const errors: string[] = [];
  for (const op of ops) {
    if (op.type === 'write') {
      next[op.path] = op.content;
    } else if (op.type === 'delete') {
      if (op.path === ENTRY_FILE) errors.push(`${op.path}: ${ENTRY_FILE} can't be deleted.`);
      else delete next[op.path];
    } else if (!(op.path in next)) {
      errors.push(`${op.path}: file does not exist. Use <file> to create it.`);
    } else {
      const replaced = replaceOnce(next[op.path], op.old, op.new);
      if (typeof replaced === 'string') next[op.path] = replaced;
      else errors.push(`${op.path}: ${replaced.error}`);
    }
  }
  return { files: next, errors };
}

/** Replace the one place `old` occurs; fall back to whole-line matching that ignores indentation. */
export function replaceOnce(source: string, old: string, replacement: string): string | { error: string } {
  if (old.trim() === '') return { error: 'the <old> text is empty. Quote the exact code to replace.' };
  const exact = source.split(old).length - 1;
  if (exact === 1) return source.replace(old, () => replacement);
  if (exact > 1) return { error: `the <old> text matches ${exact} places. Include more surrounding lines so it matches one.` };

  const lines = source.split('\n');
  const want = old.split('\n').map((l) => l.trim());
  const hits: number[] = [];
  for (let i = 0; i + want.length <= lines.length; i++) {
    if (want.every((w, j) => lines[i + j].trim() === w)) hits.push(i);
  }
  if (hits.length === 1) {
    const at = hits[0];
    return [...lines.slice(0, at), ...replacement.split('\n'), ...lines.slice(at + want.length)].join('\n');
  }
  if (hits.length > 1) return { error: `the <old> text matches ${hits.length} places. Include more surrounding lines so it matches one.` };
  return { error: 'the <old> text was not found. Copy it exactly from the current file.' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server && npm run typecheck`
Expected: PASS, and the existing `parseFiles` tests are still green.

- [ ] **Step 5: Commit**

```bash
git add src/server
git commit -m "feat(edit): parse and apply edit, file and delete blocks"
```

---

### Task 8: The edit prompt

**Files:**
- Modify: `src/server/build/prompt.ts` (extract `CODE_RULES`; the build prompt text stays identical)
- Create: `src/server/edit/editPrompt.ts`, `src/server/edit/editPrompt.test.ts`

**Interfaces:**
- Consumes: `EditRequest`, `Segment`, `MarkTarget` and `TargetElement` (Task 1). `parseSrc`/`targetElements` (Task 1). `ChatPart` from `src/server/ai/chat.ts`. `ENTRY_FILE`.
- Produces: `CODE_RULES` (prompt.ts), `EDIT_SYSTEM_PROMPT`, `MAX_WHOLE_PROJECT_CHARS = 160_000`, `compileEditPrompt(req): { ok: true; content: ChatPart[] } | { ok: false; error: string }`, `describeElement(e, files): string` and `editFixPrompt(errors, files): string`.

- [ ] **Step 1: Write the failing tests**

`src/server/edit/editPrompt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest, Segment } from '@/shared/types';
import { compileEditPrompt, describeElement, EDIT_SYSTEM_PROMPT, editFixPrompt, MAX_WHOLE_PROJECT_CHARS } from './editPrompt';

const nav = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Product Pricing Blog' };
const hero = { src: 'components/Hero.tsx:5:5', tag: 'section', text: 'Sketch it.' };
const circleNav: Segment = { n: 1, gesture: 'circle', target: { kind: 'elements', elements: [nav] }, unsure: false, wrote: [] };
const req = (over: Partial<EditRequest>): EditRequest => ({ files: SAMPLE_FILES, segments: [], instruction: '', ...over });
const textOf = (r: ReturnType<typeof compileEditPrompt>) =>
  r.ok ? r.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n') : r.error;

describe('edit system prompt', () => {
  it('shares the code rules and forbids data-src', () => {
    expect(EDIT_SYSTEM_PROMPT).toContain('react, lucide-react');
    expect(EDIT_SYSTEM_PROMPT).toContain('Never write data-src attributes');
    expect(EDIT_SYSTEM_PROMPT).toContain('<edit path="PATH">');
  });
});

describe('compileEditPrompt', () => {
  it('describes an element with its source line', () => {
    expect(describeElement(nav, SAMPLE_FILES)).toBe(
      '<nav> "Product Pricing Blog" at components/Header.tsx:5 → <nav className="flex gap-8 text-sm text-slate-600">',
    );
  });
  it('shows App.tsx and the marked files, and only lists the rest', () => {
    const text = textOf(compileEditPrompt(req({ segments: [circleNav], instruction: '1 smaller' })));
    expect(text).toContain('1. CIRCLED:');
    expect(text).toContain('Instruction: 1 smaller');
    expect(text).toContain('--- App.tsx ---');
    expect(text).toContain('--- components/Header.tsx ---');
    expect(text).not.toContain('--- components/Hero.tsx ---');
    expect(text).toContain('Other files (not shown');
  });
  it('describes moves, regions, written words and unsure marks', () => {
    const sketch: Segment = {
      n: 2, gesture: 'sketch', unsure: true, wrote: ['Testimonials'], inkPng: 'PNG',
      target: { kind: 'region', region: { width: 1200, height: 300, left: 40, top: 560, fullWidth: true, outside: null, inside: null, elementAbove: hero, elementBelow: null, covers: [] } },
    };
    const move: Segment = { ...circleNav, n: 3, gesture: 'arrow', pointsTo: { kind: 'elements', elements: [hero] } };
    const result = compileEditPrompt(req({ segments: [sketch, move] }));
    const text = textOf(result);
    expect(text).toContain('2. SKETCHED new UI (unsure):');
    expect(text).toContain('region 1200×300px, full width, 40px from the left, 560px from the top of the page');
    expect(text).toContain('below <section> "Sketch it." at components/Hero.tsx:5');
    expect(text).toContain('wrote: "Testimonials"');
    expect(text).toContain('3. POINTED AT, FROM:');
    expect(text).toContain('   TO:');
    expect(text).toContain('Instruction: (none: follow the marks)');
    expect(result.ok && result.content.slice(0, 2)).toEqual([
      { type: 'text', text: 'Ink image for mark 2:' },
      { type: 'image', pngBase64: 'PNG' },
    ]);
  });
  it('shows every file for whole-page instructions and crash fixes', () => {
    expect(textOf(compileEditPrompt(req({ instruction: 'dark mode' })))).toContain('--- components/Hero.tsx ---');
    const crash = textOf(compileEditPrompt(req({ runtimeError: 'X is not defined' })));
    expect(crash).toContain('X is not defined');
    expect(crash).toContain('--- components/Hero.tsx ---');
  });
  it('refuses a whole-page change on a huge project', () => {
    const huge = { ...SAMPLE_FILES, 'components/Big.tsx': 'x'.repeat(MAX_WHOLE_PROJECT_CHARS) };
    expect(compileEditPrompt(req({ files: huge, instruction: 'dark mode' }))).toEqual({ ok: false, error: expect.stringContaining('Point at the part') });
  });
});

describe('editFixPrompt', () => {
  it('lists errors and shows the current contents of the files they name', () => {
    const prompt = editFixPrompt(['components/Header.tsx: the <old> text was not found.', 'Missing App.tsx'], SAMPLE_FILES);
    expect(prompt).toContain('- components/Header.tsx: the <old> text was not found.');
    expect(prompt).toContain('--- components/Header.tsx ---');
    expect(prompt).not.toContain('--- components/Hero.tsx ---');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/server/edit/editPrompt.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/server/build/prompt.ts`: move the code-rule bullet lines into an exported constant. `BUILD_SYSTEM_PROMPT` must still produce exactly the same text as before.
```ts
export const CODE_RULES = `- App.tsx default-exports the page component. Put each page section in its own components/Name.tsx file with a default export.
- Use TypeScript function components. Style only with Tailwind CSS v4 utility classes.
- You may import only: ${IMPORTABLE}, and relative imports between your own files. No CSS files and no other packages.
- lucide-react has no brand or company logos (GitHub, X/Twitter, LinkedIn and so on): draw those as small inline <svg> elements.
- For images, use https://placehold.co/WIDTHxHEIGHT placeholder URLs.
- Design for a 1280px wide desktop viewport. Never use viewport-height units (vh, dvh, svh or h-screen): the preview grows to fit the page, so use fixed heights like min-h-[800px] instead.`;
```
In `BUILD_SYSTEM_PROMPT`, replace those six bullet lines under `Code rules:` with `${CODE_RULES}`.

`src/server/edit/editPrompt.ts`:
```ts
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

function filesToShow(req: EditRequest, paths: string[]): Set<string> | null {
  if (req.runtimeError || req.segments.length === 0) {
    const total = paths.reduce((n, p) => n + req.files[p].length, 0);
    return total <= MAX_WHOLE_PROJECT_CHARS ? new Set(paths) : null;
  }
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/server && npm run typecheck`
Expected: PASS, and the existing build `prompt.test.ts` is still green.

- [ ] **Step 5: Commit**

```bash
git add src/server
git commit -m "feat(edit): compile marks and relevant files into the edit prompt"
```

---

### Task 9: The edit pipeline and `/api/edit`

**Files:**
- Modify: `src/server/ai/chat.ts`, `src/server/ai/deepseek.ts`, `src/server/ai/anthropic.ts`, `src/server/ai/userMessage.ts`, `src/server/ai/userMessage.test.ts`
- Create: `src/server/edit/editProject.ts`, `src/server/edit/editProject.test.ts`, `src/server/edit/parseEditRequest.ts`, `src/server/edit/parseEditRequest.test.ts`, `src/app/api/edit/route.ts`

**Interfaces:**
- Consumes: `parseOps` (Task 7), `applyOps` (Task 7), `compileEditPrompt`, `EDIT_SYSTEM_PROMPT` and `editFixPrompt` (Task 8), `validateProject` and `parseSummary` (M1), and `selectProvider` (M1).
- Produces:
  - `Generate` gains an optional `signal?: AbortSignal` argument.
  - `userMessage(err, provider, doing = 'building')`.
  - `editProject.ts`: `EDIT_TIMEOUT_MS = 45_000`, `MAX_FIX_ROUNDS = 2` and `editProject(req, generate, signal?): Promise<EditResponse>`.
  - `parseEditRequest.ts`: `parseEditRequest(body)` plus the caps `MAX_FILES`, `MAX_TOTAL_CHARS`, `MAX_SEGMENTS` and `MAX_INSTRUCTION_CHARS`.
  - A `POST /api/edit` route.

- [ ] **Step 1: Write the failing tests**

`src/server/edit/editProject.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ChatMessage, Generate } from '@/server/ai/chat';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest } from '@/shared/types';
import { editProject, MAX_FIX_ROUNDS } from './editProject';

const REQ: EditRequest = { files: SAMPLE_FILES, segments: [], instruction: 'bigger title' };
const GOOD = '<edit path="components/Hero.tsx"><old>text-5xl</old><new>text-6xl</new></edit><summary>Bigger title.</summary>';

function scripted(...answers: string[]) {
  const calls: Array<{ messages: ChatMessage[]; signal?: AbortSignal }> = [];
  const generate: Generate = async ({ messages, signal }) => {
    calls.push({ messages: [...messages], signal });
    return answers[calls.length - 1] ?? '';
  };
  return { generate, calls };
}

const lastUserText = (messages: ChatMessage[]) => {
  const last = messages[messages.length - 1];
  return typeof last.content === 'string' ? last.content : '';
};

describe('editProject', () => {
  it('applies a clean edit on the first try', async () => {
    const { generate, calls } = scripted(GOOD);
    const result = await editProject(REQ, generate);
    expect(result).toEqual({ ok: true, files: { ...SAMPLE_FILES, 'components/Hero.tsx': SAMPLE_FILES['components/Hero.tsx'].replace('text-5xl', 'text-6xl') }, summary: 'Bigger title.' });
    expect(calls).toHaveLength(1);
  });
  it('passes the abort signal through', async () => {
    const { generate, calls } = scripted(GOOD);
    const signal = new AbortController().signal;
    await editProject(REQ, generate, signal);
    expect(calls[0].signal).toBe(signal);
  });
  it('sends apply errors back with the current file, then succeeds', async () => {
    const { generate, calls } = scripted('<edit path="components/Hero.tsx"><old>text-9xl</old><new>x</new></edit>', GOOD);
    const result = await editProject(REQ, generate);
    expect(result.ok).toBe(true);
    const fix = lastUserText(calls[1].messages);
    expect(fix).toContain('the <old> text was not found');
    expect(fix).toContain('--- components/Hero.tsx ---');
  });
  it('sends compile errors back, and the fix builds on the broken file', async () => {
    const broken =
      '<edit path="components/Hero.tsx"><old>text-5xl font-extrabold tracking-tight">Sketch it. Ship it.</h1></old><new>text-6xl"><h1></new></edit>';
    const repair =
      '<edit path="components/Hero.tsx"><old>text-6xl"><h1></old><new>text-6xl">Sketch it. Ship it.</h1></new></edit><summary>Bigger title.</summary>';
    const { generate, calls } = scripted(broken, repair);
    const result = await editProject(REQ, generate);
    expect(calls).toHaveLength(2);
    expect(lastUserText(calls[1].messages)).toMatch(/^These problems[\s\S]*- components\/Hero\.tsx: /);
    expect(result.ok && result.files['components/Hero.tsx']).toContain('<h1 className="text-6xl">Sketch it. Ship it.</h1>');
  });
  it('treats an answer with no change blocks as an error to fix', async () => {
    const { generate, calls } = scripted('Sure! I made it bigger.', GOOD);
    expect((await editProject(REQ, generate)).ok).toBe(true);
    expect(lastUserText(calls[1].messages)).toContain('No <edit>, <file> or <delete> blocks');
  });
  it('gives up after the fix rounds with a readable error', async () => {
    const bad = '<edit path="components/Hero.tsx"><old>nope</old><new>x</new></edit>';
    const { generate, calls } = scripted(bad, bad, bad, bad);
    const result = await editProject(REQ, generate);
    expect(calls).toHaveLength(MAX_FIX_ROUNDS + 1);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Couldn't apply that: .*Try rephrasing or pointing more precisely\.$/) });
  });
  it('fails fast when the prompt cannot be built', async () => {
    const { generate, calls } = scripted(GOOD);
    const huge = { ...SAMPLE_FILES, 'components/Big.tsx': 'x'.repeat(200_000) };
    expect((await editProject({ ...REQ, files: huge }, generate)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
```
`src/server/edit/parseEditRequest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseEditRequest, MAX_FILES, MAX_INSTRUCTION_CHARS } from './parseEditRequest';

const files = { 'App.tsx': 'export default function App() { return null; }\n' };
const el = { src: 'App.tsx:1:1', tag: 'div', text: '' };
const segment = { n: 1, gesture: 'circle', target: { kind: 'elements', elements: [el] }, unsure: false, wrote: [] };
const region = {
  n: 2, gesture: 'sketch', unsure: true, wrote: ['Hi'], inkPng: 'AAAA',
  target: { kind: 'region', region: { width: 10, height: 10, left: 0, top: 0, fullWidth: false, outside: null, inside: el, elementAbove: null, elementBelow: null, covers: [el] } },
};

describe('parseEditRequest', () => {
  it('accepts a valid request and trims the instruction to the cap', () => {
    const result = parseEditRequest({ files, segments: [segment, region], instruction: 'x'.repeat(MAX_INSTRUCTION_CHARS + 5) });
    expect(result.ok && result.value.instruction.length).toBe(MAX_INSTRUCTION_CHARS);
    expect(result.ok && result.value.segments).toHaveLength(2);
  });
  it('accepts a crash-fix request with no marks or instruction', () => {
    expect(parseEditRequest({ files, segments: [], instruction: '', runtimeError: 'boom' }).ok).toBe(true);
  });
  it('rejects bad bodies with a readable error', () => {
    expect(parseEditRequest(null)).toEqual({ ok: false, error: expect.any(String) });
    expect(parseEditRequest({ files: {}, segments: [], instruction: 'x' })).toEqual({ ok: false, error: expect.stringContaining('App.tsx') });
    const many = Object.fromEntries(Array.from({ length: MAX_FILES + 1 }, (_, i) => [`F${i}.tsx`, '']));
    expect(parseEditRequest({ files: { ...many, ...files }, segments: [], instruction: 'x' }).ok).toBe(false);
    expect(parseEditRequest({ files, segments: [{ ...segment, gesture: 'poke' }], instruction: 'x' }).ok).toBe(false);
    expect(parseEditRequest({ files, segments: [], instruction: '   ' })).toEqual({ ok: false, error: expect.stringContaining('Say what to change') });
  });
});
```

Append to `src/server/ai/userMessage.test.ts` inside `describe('userMessage', …)` (the file already imports `OpenAI` and defines `deepseek`):
```ts
  it('explains a timeout', () => {
    expect(userMessage(new OpenAI.APIUserAbortError(), deepseek)).toBe('Took too long. Try a smaller change.');
    expect(userMessage(Object.assign(new Error('t'), { name: 'TimeoutError' }), deepseek)).toBe('Took too long. Try a smaller change.');
  });
  it('names the action in the generic fallback', () => {
    expect(userMessage(new Error('???'), deepseek, 'editing')).toBe('Something went wrong while editing. Please try again.');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/server`
Expected: FAIL (modules not found; the new `userMessage` expectations fail).

- [ ] **Step 3: Implement**

`src/server/ai/chat.ts`: change the `Generate` type to:
```ts
/** Sends a conversation to the model and returns its text. Injected so tests never call an API. */
export type Generate = (args: { system: string; messages: ChatMessage[]; signal?: AbortSignal }) => Promise<string>;
```

`src/server/ai/deepseek.ts`: destructure `signal` and pass it as request options:
```ts
  return async ({ system, messages, signal }) => {
    const completion = await client.chat.completions.create(
      { model: DEEPSEEK_MODEL, max_tokens: 32000, messages: toOpenAIMessages(system, messages) },
      { signal },
    );
```
(the rest of the function is unchanged).

`src/server/ai/anthropic.ts`: same idea:
```ts
  return async ({ system, messages, signal }) => {
    const stream = client.beta.messages.stream(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        system,
        messages: toAnthropicMessages(messages),
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { signal },
    );
```
(keep the existing comment above `betas`, and leave the rest unchanged).

`src/server/ai/userMessage.ts`: change the signature to `export function userMessage(err: unknown, provider: ProviderInfo, doing = 'building'): string`. Add this as the first check, before the `BuildError` check:
```ts
  if (
    err instanceof Anthropic.APIUserAbortError ||
    err instanceof OpenAI.APIUserAbortError ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  ) {
    return 'Took too long. Try a smaller change.';
  }
```
Then change the last line to ``return `Something went wrong while ${doing}. Please try again.`;``.

`src/server/edit/editProject.ts`:
```ts
import type { ChatMessage, Generate } from '@/server/ai/chat';
import { parseSummary } from '@/server/build/parseFiles';
import { validateProject } from '@/server/build/validateProject';
import type { EditRequest, EditResponse } from '@/shared/types';
import { applyOps } from './applyOps';
import { compileEditPrompt, EDIT_SYSTEM_PROMPT, editFixPrompt } from './editPrompt';
import { parseOps } from './parseOps';

/** Spec §8: cancel after 45 s and keep the old version. */
export const EDIT_TIMEOUT_MS = 45_000;
/** One fix round per stage (apply, then compile). */
export const MAX_FIX_ROUNDS = 2;

/** Ask the model for changes, apply them, verify with the preview's compiler, and retry with the errors. */
export async function editProject(req: EditRequest, generate: Generate, signal?: AbortSignal): Promise<EditResponse> {
  const prompt = compileEditPrompt(req);
  if (!prompt.ok) return { ok: false, error: prompt.error };

  const messages: ChatMessage[] = [{ role: 'user', content: prompt.content }];
  let files = req.files;
  let summary: string | null = null;
  for (let round = 0; ; round++) {
    const text = await generate({ system: EDIT_SYSTEM_PROMPT, messages, signal });
    summary = parseSummary(text) ?? summary;
    const ops = parseOps(text);
    // Later rounds build on what already applied, so the model only resends what failed.
    const applied = applyOps(files, ops);
    files = applied.files;
    let errors = ops.length === 0 ? ['No <edit>, <file> or <delete> blocks found. Answer only in that format.'] : applied.errors;
    if (errors.length === 0) {
      const checked = validateProject(files);
      if (checked.ok) return { ok: true, files: checked.files, summary: summary ?? 'Updated the page.' };
      errors = checked.errors;
    }
    if (round >= MAX_FIX_ROUNDS) {
      return { ok: false, error: `Couldn't apply that: ${errors[0]} Try rephrasing or pointing more precisely.` };
    }
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: editFixPrompt(errors, files) });
  }
}
```

`src/server/edit/parseEditRequest.ts`:
```ts
import type { EditRequest, MarkTarget, RegionDescription, Segment, TargetElement } from '@/shared/types';

export const MAX_FILES = 60;
export const MAX_TOTAL_CHARS = 400_000;
export const MAX_SEGMENTS = 20;
export const MAX_INSTRUCTION_CHARS = 2000;
const MAX_INK_BYTES = 1024 * 1024;
const GESTURES: ReadonlySet<unknown> = new Set(['circle', 'arrow', 'cross-out', 'underline', 'sketch']);
const SIDES: ReadonlySet<unknown> = new Set(['left', 'right', 'above', 'below']);

export type ParseEditRequestResult = { ok: true; value: EditRequest } | { ok: false; error: string };

export function parseEditRequest(body: unknown): ParseEditRequestResult {
  if (!isObject(body)) return fail('Request body must be a JSON object.');
  const { files, segments, instruction, runtimeError } = body;
  if (!isObject(files) || !Object.values(files).every((v) => typeof v === 'string')) {
    return fail('files must map paths to file contents.');
  }
  const contents = Object.values(files) as string[];
  if (!('App.tsx' in files)) return fail('files must include App.tsx.');
  if (contents.length > MAX_FILES) return fail(`Too many files (max ${MAX_FILES}).`);
  if (contents.reduce((n, v) => n + v.length, 0) > MAX_TOTAL_CHARS) return fail('This page is too big to edit.');
  if (!Array.isArray(segments) || segments.length > MAX_SEGMENTS || !segments.every(isSegment)) {
    return fail(`segments must be a list of at most ${MAX_SEGMENTS} valid marks.`);
  }
  if (instruction !== undefined && typeof instruction !== 'string') return fail('instruction must be a string.');
  if (runtimeError !== undefined && typeof runtimeError !== 'string') return fail('runtimeError must be a string.');
  const text = typeof instruction === 'string' ? instruction.slice(0, MAX_INSTRUCTION_CHARS) : '';
  const crash = typeof runtimeError === 'string' ? runtimeError.slice(0, MAX_INSTRUCTION_CHARS) : '';
  if (text.trim() === '' && segments.length === 0 && crash === '') return fail('Say what to change, or draw on the page.');
  return {
    ok: true,
    value: { files: files as Record<string, string>, segments, instruction: text, ...(crash ? { runtimeError: crash } : {}) },
  };
}

function fail(error: string): ParseEditRequestResult {
  return { ok: false, error };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isShortString = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length <= max;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isTargetElement(v: unknown): v is TargetElement {
  return isObject(v) && isShortString(v.src) && isShortString(v.tag, 40) && isShortString(v.text);
}

const isElementOrNull = (v: unknown) => v === null || isTargetElement(v);

function isRegion(v: unknown): v is RegionDescription {
  return (
    isObject(v) &&
    [v.width, v.height, v.left, v.top].every(isNumber) &&
    typeof v.fullWidth === 'boolean' &&
    (v.outside === null || SIDES.has(v.outside)) &&
    isElementOrNull(v.inside) &&
    isElementOrNull(v.elementAbove) &&
    isElementOrNull(v.elementBelow) &&
    Array.isArray(v.covers) &&
    v.covers.length <= 8 &&
    v.covers.every(isTargetElement)
  );
}

function isTarget(v: unknown): v is MarkTarget {
  if (!isObject(v)) return false;
  if (v.kind === 'elements') return Array.isArray(v.elements) && v.elements.length <= 20 && v.elements.every(isTargetElement);
  return v.kind === 'region' && isRegion(v.region);
}

function isSegment(v: unknown): v is Segment {
  return (
    isObject(v) &&
    Number.isInteger(v.n) &&
    GESTURES.has(v.gesture) &&
    isTarget(v.target) &&
    (v.pointsTo === undefined || isTarget(v.pointsTo)) &&
    typeof v.unsure === 'boolean' &&
    Array.isArray(v.wrote) &&
    v.wrote.length <= 10 &&
    v.wrote.every((w) => isShortString(w, 500)) &&
    (v.inkPng === undefined ||
      (typeof v.inkPng === 'string' && v.inkPng.length > 0 && Math.floor((v.inkPng.length * 3) / 4) <= MAX_INK_BYTES))
  );
}
```

`src/app/api/edit/route.ts`. Route files may only export route handlers and segment config (the constants live in `editProject.ts`). `maxDuration` is from `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`.
```ts
import { NextResponse } from 'next/server';
import { selectProvider } from '@/server/ai/provider';
import { userMessage } from '@/server/ai/userMessage';
import { EDIT_TIMEOUT_MS, editProject } from '@/server/edit/editProject';
import { parseEditRequest } from '@/server/edit/parseEditRequest';
import type { EditResponse } from '@/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse<EditResponse>> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseEditRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const selected = selectProvider(process.env);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: 500 });
  const { provider } = selected;

  try {
    return NextResponse.json(await editProject(parsed.value, provider.generate, AbortSignal.timeout(EDIT_TIMEOUT_MS)));
  } catch (err) {
    console.error(`[api/edit] ${provider.name}/${provider.model}`, err);
    return NextResponse.json({ ok: false, error: userMessage(err, provider, 'editing') }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (the whole suite).

- [ ] **Step 5: Smoke-test the route with no AI call**

Run: `npm run dev` in the background, then:
```bash
curl -s -X POST localhost:3000/api/edit -H 'Content-Type: application/json' -d '{"files":{},"segments":[],"instruction":"x"}'
```
Expected: `{"ok":false,"error":"files must include App.tsx."}`

- [ ] **Step 6: Commit**

```bash
git add src/server src/app
git commit -m "feat(api): /api/edit applies AI edits with verify, fix rounds and a 45s timeout"
```

---

### Task 10: Sending an edit, undo, and the crash fix

**Files:**
- Create: `src/board/api.ts`, `src/board/imageData.ts`, `src/board/crashPolicy.ts`, `src/board/crashPolicy.test.ts`, `src/board/editSession.ts`, `src/board/sendEdit.ts`
- Modify: `src/board/buildFromSelection.ts` (use `postApi` and `blobToBase64`), `src/frame/FramePreview.tsx` (forward runtime errors)

**Interfaces:**
- Consumes: `EditPlan`, `planShapeIds`, `needsInk`, `toSegment` and `statusLine` (Task 6). `fitScale` (M1 `selectionHelpers`). `unionRects` (Task 1). `EditRequest`/`EditResponse` (Task 1).
- Produces:
  - `api.ts`: `postApi<T extends { ok: boolean }>(url, body): Promise<T | { ok: false; error: string }>`.
  - `imageData.ts`: `blobToBase64(blob)`.
  - `crashPolicy.ts`: `VERIFY_WINDOW_MS = 15_000`, `CrashRecord { appliedAt; fixAttempted; fixing }` and `decideOnCrash(record, now): 'fix' | 'revert' | 'ignore'`.
  - `editSession.ts`: `EditStatus`, the `editStatus` atom, `EditRecord`, `rememberEdit`, `getEditRecord` and `forgetEdit`.
  - `sendEdit.ts`: `sendEdit(editor, plan, instruction): Promise<boolean>` and `handlePreviewCrash(editor, frameId, message): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`src/board/crashPolicy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decideOnCrash, VERIFY_WINDOW_MS } from './crashPolicy';

const fresh = { appliedAt: 1000, fixAttempted: false, fixing: false };

describe('decideOnCrash', () => {
  it('ignores crashes of pages no edit just produced', () => {
    expect(decideOnCrash(undefined, 5000)).toBe('ignore');
    expect(decideOnCrash(fresh, 1000 + VERIFY_WINDOW_MS + 1)).toBe('ignore');
  });
  it('fixes the first crash after an edit', () => {
    expect(decideOnCrash(fresh, 3000)).toBe('fix');
  });
  it('ignores repeat reports while the fix is running', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true, fixing: true }, 3000)).toBe('ignore');
  });
  it('reverts when the fixed version crashes too', () => {
    expect(decideOnCrash({ ...fresh, fixAttempted: true }, 3000)).toBe('revert');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/board/crashPolicy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/board/crashPolicy.ts`:
```ts
/** How long after an AI edit a crash counts as "the edit broke the page". Covers loading libraries from the CDN. */
export const VERIFY_WINDOW_MS = 15_000;

export interface CrashRecord {
  appliedAt: number;
  fixAttempted: boolean;
  /** A fix request is in flight: further error reports are echoes of the same crash. */
  fixing: boolean;
}

export type CrashAction = 'fix' | 'revert' | 'ignore';

/** Spec §6.3: one automatic fix for a runtime error; if that fails, keep the previous version. */
export function decideOnCrash(record: CrashRecord | undefined, now: number): CrashAction {
  if (!record || record.fixing) return 'ignore';
  if (now - record.appliedAt > VERIFY_WINDOW_MS) return 'ignore';
  return record.fixAttempted ? 'revert' : 'fix';
}
```

`src/board/api.ts`:
```ts
/** POST JSON to one of our API routes. A network failure becomes a readable error instead of a throw. */
export async function postApi<T extends { ok: boolean }>(url: string, body: unknown): Promise<T | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check that it is running and try again.' };
  }
}
```

`src/board/imageData.ts`: move `blobToBase64` here verbatim from `buildFromSelection.ts` and `export` it:
```ts
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
```

`src/board/buildFromSelection.ts`:
- Delete the local `blobToBase64` and import it from `./imageData`.
- Replace the local `postBuild` function with `postApi<BuildResponse>('/api/build', …)` from `./api`: the call becomes `const response = await postApi<BuildResponse>('/api/build', { kind: check.kind, images, note } satisfies BuildRequest).finally(() => finishBuild(frameId));`.
- Delete `postBuild`.

`src/board/editSession.ts`:
```ts
import { atom, type TLShape, type TLShapeId } from 'tldraw';
import type { ProjectFiles } from '@/shared/types';
import type { CrashRecord } from './crashPolicy';

export type EditStatus = { phase: 'idle' | 'working' | 'done' | 'error'; text: string };

/** What the instruction panel shows under the Send button. */
export const editStatus = atom<EditStatus>('edit status', { phase: 'idle', text: '' });

/** The last AI edit per frame: enough to fix it once or put everything back. */
export interface EditRecord extends CrashRecord {
  frameId: TLShapeId;
  previousFiles: ProjectFiles;
  /** The mark shapes the edit consumed, restored on revert. */
  marks: TLShape[];
}

const records = new Map<TLShapeId, EditRecord>();

export function rememberEdit(record: EditRecord): void {
  records.set(record.frameId, record);
}

export function getEditRecord(frameId: TLShapeId): EditRecord | undefined {
  return records.get(frameId);
}

export function forgetEdit(frameId: TLShapeId): void {
  records.delete(frameId);
}
```

`src/board/sendEdit.ts`:
```ts
import type { Editor, TLShapeId } from 'tldraw';
import type { FrameShape } from '@/frame/FrameShapeUtil';
import { FRAME_TYPE } from '@/frame/frameTypes';
import { needsInk, planShapeIds, statusLine, toSegment, type EditPlan, type PlannedMark } from '@/marks/planEdit';
import { unionRects } from '@/shared/geometry';
import type { EditRequest, EditResponse } from '@/shared/types';
import { postApi } from './api';
import { decideOnCrash } from './crashPolicy';
import { editStatus, forgetEdit, getEditRecord, rememberEdit, type EditRecord } from './editSession';
import { blobToBase64 } from './imageData';
import { fitScale } from './selectionHelpers';

const INK_MAX_PX = 512;
const INK_PADDING = 16;
const FAILED = "Couldn't apply that. Try rephrasing or pointing more precisely.";

function getFrame(editor: Editor, id: string): FrameShape | undefined {
  const shape = editor.getShape(id as TLShapeId);
  return shape?.type === FRAME_TYPE ? (shape as FrameShape) : undefined;
}

function fail(text: string): false {
  editStatus.set({ phase: 'error', text });
  return false;
}

/** Send the plan and instruction; apply the result and remove the sent marks as one undo step. */
export async function sendEdit(editor: Editor, plan: EditPlan, instruction: string): Promise<boolean> {
  const frame = getFrame(editor, plan.frameId);
  if (!frame) return fail('That page is gone. Draw on another page.');
  const files = frame.props.files;
  editStatus.set({ phase: 'working', text: statusLine(plan) });

  const segments = await Promise.all(
    plan.marks.map(async (mark) => toSegment(mark, needsInk(mark) ? await inkPng(editor, mark) : undefined)),
  );
  const response = await postApi<EditResponse>('/api/edit', { files, segments, instruction } satisfies EditRequest);

  const current = getFrame(editor, plan.frameId);
  if (!current) return fail('The page was removed before the edit finished.');
  if (!response.ok) return fail(response.error);
  // An undo or another edit changed the page meanwhile: applying now would silently drop that change.
  if (current.props.files !== files) return fail('The page changed while editing. Try again.');

  // Only the marks that were sent: strokes drawn while waiting stay as the next marks.
  const markIds = planShapeIds(plan)
    .map((id) => id as TLShapeId)
    .filter((id) => editor.getShape(id));
  const marks = markIds.map((id) => editor.getShape(id)!);
  // One undo step: ⌘Z brings back the old page and its marks together.
  editor.markHistoryStoppingPoint('edit');
  editor.run(() => {
    editor.updateShape({ id: current.id, type: FRAME_TYPE, props: { files: response.files } });
    editor.deleteShapes(markIds);
  });
  rememberEdit({ frameId: current.id, previousFiles: files, marks, appliedAt: Date.now(), fixAttempted: false, fixing: false });
  editStatus.set({ phase: 'done', text: response.summary });
  return true;
}

/** Called for every runtime error a preview reports; acts only on pages an edit just produced. */
export async function handlePreviewCrash(editor: Editor, frameId: TLShapeId, message: string): Promise<void> {
  const record = getEditRecord(frameId);
  const action = decideOnCrash(record, Date.now());
  if (!record || action === 'ignore') return;
  if (action === 'revert') return revertEdit(editor, record);

  const frame = getFrame(editor, frameId);
  if (!frame) return;
  record.fixAttempted = true;
  record.fixing = true;
  editStatus.set({ phase: 'working', text: 'The new version crashed. Fixing it…' });
  const broken = frame.props.files;
  const response = await postApi<EditResponse>('/api/edit', {
    files: broken,
    segments: [],
    instruction: '',
    runtimeError: message.slice(0, 2000),
  } satisfies EditRequest);
  record.fixing = false;

  const current = getFrame(editor, frameId);
  if (!current || current.props.files !== broken) return; // the user moved on (undo, another edit)
  if (!response.ok) return revertEdit(editor, record);
  // Part of the same edit: ⌘Z still goes straight back to the version before it.
  editor.run(() => editor.updateShape({ id: frameId, type: FRAME_TYPE, props: { files: response.files } }), { history: 'ignore' });
  record.appliedAt = Date.now(); // watch the fixed version too; another crash reverts
  editStatus.set({ phase: 'done', text: 'Fixed a crash in the new version.' });
}

function revertEdit(editor: Editor, record: EditRecord): void {
  forgetEdit(record.frameId);
  if (!getFrame(editor, record.frameId)) return;
  editor.run(
    () => {
      editor.updateShape({ id: record.frameId, type: FRAME_TYPE, props: { files: record.previousFiles } });
      editor.createShapes(record.marks.filter((m) => !editor.getShape(m.id)));
    },
    { history: 'ignore' },
  );
  editStatus.set({ phase: 'error', text: FAILED });
}

/** A small PNG of the mark's ink alone (spec §5.2, with Decision 3). Undefined if export fails. */
async function inkPng(editor: Editor, mark: PlannedMark): Promise<string | undefined> {
  const ids = mark.shapeIds.map((id) => id as TLShapeId);
  const boxes = ids.flatMap((id) => {
    const b = editor.getShapePageBounds(id);
    return b ? [{ x: b.x, y: b.y, w: b.w, h: b.h }] : [];
  });
  if (boxes.length === 0) return undefined;
  const box = unionRects(boxes);
  try {
    const { blob } = await editor.toImage(ids, {
      format: 'png',
      background: true,
      padding: INK_PADDING,
      pixelRatio: 1,
      scale: fitScale(box.w + 2 * INK_PADDING, box.h + 2 * INK_PADDING, INK_MAX_PX, INK_MAX_PX),
    });
    return await blobToBase64(blob);
  } catch {
    return undefined;
  }
}
```

`src/frame/FramePreview.tsx`: import `handlePreviewCrash` from `@/board/sendEdit`. In `onMessage`, change the runtime-error branch to:
```ts
      if (msg.type === 'runtime-error') {
        setProblem(msg.message);
        void handlePreviewCrash(editor, shape.id, msg.message);
        return;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/board src/frame
git commit -m "feat(board): send edits as one undo step; fix a crashing result once or revert"
```

---

### Task 11: Badges, highlights and the instruction panel

**Files:**
- Create: `src/board/useEditPlan.ts`, `src/board/MarkOverlay.tsx`, `src/board/InstructionPanel.tsx`, `src/board/recordEvalCase.ts`
- Modify: `src/board/Board.tsx`

**Interfaces:**
- Consumes: `planEdit` (Task 6), `readPendingStrokes`, `readFrames` and `selectedFrameId` (Task 3), `describeMark` (Task 6), `expectationsFor`/`EvalCase` (Task 6), and `sendEdit` and `editStatus` (Task 10).
- Produces: `useEditPlan(editor): PlanResult`, `MarkOverlay` (for tldraw's `InFrontOfTheCanvas` slot), `InstructionPanel({ editor })` and `recordEvalCase(editor, plan)`.

These are React/tldraw glue with no new logic, so they get no unit tests. Task 12 verifies them in the browser.

- [ ] **Step 1: Implement the hook and the overlay**

`src/board/useEditPlan.ts`:
```ts
import { useValue, type Editor } from 'tldraw';
import { planEdit, type PlanResult } from '@/marks/planEdit';
import { readFrames, readPendingStrokes, selectedFrameId } from '@/marks/readBoard';

/** The live edit plan. Recomputes when marks, frames, element maps or the selection change. */
export function useEditPlan(editor: Editor): PlanResult {
  return useValue('edit plan', () => planEdit(readPendingStrokes(editor), readFrames(editor), selectedFrameId(editor)), [editor]);
}
```

`src/board/MarkOverlay.tsx`:
```tsx
'use client';

import { useEditor, useValue } from 'tldraw';
import type { Rect } from '@/shared/geometry';
import { useEditPlan } from './useEditPlan';

const BLUE = '#2563eb';
const AMBER = '#f59e0b';

/** Numbered badges on each mark and outlines on what it hit. Screen-space, so they stay readable at any zoom. */
export function MarkOverlay() {
  const editor = useEditor();
  const result = useEditPlan(editor);
  // Re-render on pan/zoom so everything stays pinned to its mark.
  useValue('camera', () => editor.getCamera(), [editor]);
  if (!result.ok) return null;

  const toScreen = (r: Rect) => {
    const a = editor.pageToViewport({ x: r.x, y: r.y });
    const b = editor.pageToViewport({ x: r.x + r.w, y: r.y + r.h });
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {result.plan.marks.flatMap((mark) =>
        mark.hit.highlights.map((r, i) => (
          <div
            key={`${mark.n}-${i}`}
            style={{
              position: 'absolute',
              ...toScreen(r),
              outline: `2px ${mark.hit.target.kind === 'region' ? 'dashed' : 'solid'} ${mark.hit.unsure ? AMBER : BLUE}`,
              background: mark.hit.unsure ? 'rgba(245,158,11,0.08)' : 'rgba(37,99,235,0.08)',
              borderRadius: 4,
            }}
          />
        )),
      )}
      {result.plan.marks.map((mark) => {
        const p = editor.pageToViewport({ x: mark.bounds.x, y: mark.bounds.y });
        return (
          <div
            key={mark.n}
            style={{
              position: 'absolute',
              left: p.x - 12,
              top: p.y - 12,
              minWidth: 24,
              height: 24,
              padding: '0 6px',
              borderRadius: 12,
              background: mark.hit.unsure ? AMBER : BLUE,
              color: '#fff',
              font: '600 13px/24px system-ui, sans-serif',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }}
          >
            {mark.hit.unsure ? `${mark.n}?` : mark.n}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement the panel and the eval-case recorder**

`src/board/recordEvalCase.ts`:
```ts
import type { Editor } from 'tldraw';
import { expectationsFor, type EvalCase } from '@/marks/evals/score';
import type { EditPlan } from '@/marks/planEdit';
import { readFrames, readPendingStrokes } from '@/marks/readBoard';

/** Dev tool: download the current marks as a targeting eval case. Check `expected` by hand, then save it to src/marks/evals/cases/. */
export function recordEvalCase(editor: Editor, plan: EditPlan): void {
  const ids = new Set(plan.marks.flatMap((m) => m.shapeIds));
  const evalCase: EvalCase = {
    name: `recorded-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    frames: readFrames(editor).filter((f) => f.id === plan.frameId),
    strokes: readPendingStrokes(editor).filter((s) => ids.has(s.shapeId)),
    selectedFrameId: null,
    expected: expectationsFor(plan),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(evalCase, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${evalCase.name}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
```

`src/board/InstructionPanel.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useValue, type Editor } from 'tldraw';
import { describeMark } from '@/marks/describeMark';
import { editStatus } from './editSession';
import { recordEvalCase } from './recordEvalCase';
import { sendEdit } from './sendEdit';
import { useEditPlan } from './useEditPlan';

const STATUS_COLOR = { idle: '#71717a', working: '#2563eb', done: '#15803d', error: '#b91c1c' } as const;

export function InstructionPanel({ editor }: { editor: Editor }) {
  const result = useEditPlan(editor);
  const status = useValue(editStatus);
  const [text, setText] = useState('');
  const plan = result.ok ? result.plan : null;
  const busy = status.phase === 'working';
  const canSend = !!plan && !busy && (text.trim() !== '' || plan.marks.length > 0);

  async function onSend() {
    if (!plan || !canSend) return;
    if (await sendEdit(editor, plan, text.trim())) setText('');
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 64,
        zIndex: 1000,
        width: 340,
        display: 'grid',
        gap: 8,
        padding: 12,
        background: '#fff',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        font: '14px/1.4 system-ui, sans-serif',
      }}
    >
      <div style={{ fontWeight: 600, color: '#3f3f46' }}>Change the page</div>
      {plan && plan.marks.length > 0 ? (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
          {plan.marks.map((mark) => (
            <li key={mark.n} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ color: mark.hit.unsure ? '#b45309' : '#2563eb', fontWeight: 600 }}>{mark.n}</span>
              <span style={{ color: '#3f3f46' }}>{describeMark(mark)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div style={{ color: '#71717a' }}>{result.ok ? 'No marks: the change applies to the whole page.' : result.message}</div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void onSend();
          }
        }}
        rows={3}
        disabled={busy}
        placeholder='What should change? Refer to marks by number, e.g. "1 smaller".'
        style={{ resize: 'vertical', padding: '6px 10px', border: '1px solid #d4d4d8', borderRadius: 8, font: 'inherit' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => void onSend()}
          disabled={!canSend}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: 0,
            font: 'inherit',
            fontWeight: 600,
            background: canSend ? '#18181b' : '#a1a1aa',
            color: '#fff',
            cursor: canSend ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Working…' : 'Send ⌘↵'}
        </button>
        {process.env.NODE_ENV !== 'production' && plan && plan.marks.length > 0 && (
          <button
            onClick={() => recordEvalCase(editor, plan)}
            style={{ border: 0, background: 'none', color: '#71717a', textDecoration: 'underline', cursor: 'pointer', font: '12px system-ui' }}
          >
            Save as eval case
          </button>
        )}
      </div>
      {status.phase !== 'idle' && (
        <div role="status" style={{ color: STATUS_COLOR[status.phase] }}>
          {status.text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire everything into the board**

`src/board/Board.tsx`:
- Import `type TLComponents` from `tldraw`, `MarkOverlay` from `./MarkOverlay` and `InstructionPanel` from `./InstructionPanel`.
- Next to `const shapeUtils = …`, add:
```tsx
const components: TLComponents = { InFrontOfTheCanvas: MarkOverlay };
```
- Pass `components={components}` to `<Tldraw>`.
- After `{editor && <BuildBar editor={editor} />}`, add `{editor && <InstructionPanel editor={editor} />}`.
- Keep the `return registerMarkTracking(mounted);` added in Task 3.

- [ ] **Step 4: Verify it compiles and the board loads**

Run: `npm test && npm run typecheck`. Then start `npm run dev`, open `http://localhost:3000`, and check:
- The board loads.
- The "Change the page" panel shows at the bottom right.
- Drawing a circle around the sample page's nav shows badge **1**, a blue outline on the nav, and the row `Circled <nav> “Product Pricing Blog” · Header.tsx:5`.

Expected: all three are true, and there are no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/board
git commit -m "feat(board): numbered badges, target highlights and the instruction panel"
```

---

### Task 12: Live verification, recorded evals, and docs

**Files:**
- Create: `src/server/edit/editProject.live.test.ts`, recorded `src/marks/evals/cases/*.json`
- Modify: `package.json` (script), `.gitignore`, `docs/superpowers/specs/2026-09-28-drawai-v1-design.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the live edit eval**

`src/server/edit/editProject.live.test.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '@/frame/sampleFiles';
import type { EditRequest, MarkTarget, ProjectFiles, Segment, TargetElement } from '@/shared/types';
import { EDIT_TIMEOUT_MS, editProject } from './editProject';

const LIVE = process.env.EVAL_LIVE === '1';
const nav: TargetElement = { src: 'components/Header.tsx:5:7', tag: 'nav', text: 'Product Pricing Blog' };
const hero: TargetElement = { src: 'components/Hero.tsx:5:5', tag: 'section', text: 'Sketch it. Ship it.' };
const para: TargetElement = { src: 'components/Hero.tsx:7:7', tag: 'p', text: 'Draw your idea and get a real page.' };
const button: TargetElement = { src: 'components/Hero.tsx:8:7', tag: 'button', text: 'Get started' };

const on = (...elements: TargetElement[]): MarkTarget => ({ kind: 'elements', elements });
const seg = (n: number, gesture: Segment['gesture'], target: MarkTarget, wrote: string[] = []): Segment => ({ n, gesture, target, unsure: false, wrote });
const below: MarkTarget = {
  kind: 'region',
  region: { width: 1100, height: 300, left: 90, top: 420, fullWidth: true, outside: null, inside: null, elementAbove: hero, elementBelow: null, covers: [] },
};
const all = (files: ProjectFiles) => Object.values(files).join('\n');

const CASES: Array<{ name: string; request: EditRequest; check: (files: ProjectFiles) => boolean }> = [
  {
    name: 'circle nav: bigger and bold',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'circle', on(nav))], instruction: '1 bigger and bold' },
    check: (f) => f['components/Header.tsx'] !== SAMPLE_FILES['components/Header.tsx'] && /font-(semibold|bold)/.test(f['components/Header.tsx']),
  },
  {
    name: 'arrow at button: blue',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'arrow', on(button))], instruction: 'make it blue' },
    check: (f) => /bg-blue-\d+/.test(f['components/Hero.tsx']),
  },
  {
    name: 'cross out the paragraph',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'cross-out', on(para))], instruction: '' },
    check: (f) => !all(f).includes('Draw your idea'),
  },
  {
    name: 'sketch testimonials below the hero',
    request: { files: SAMPLE_FILES, segments: [seg(1, 'sketch', below, ['Testimonials'])], instruction: 'add three testimonial cards here' },
    check: (f) => /testimonial/i.test(all(f)),
  },
  {
    name: 'whole page dark',
    request: { files: SAMPLE_FILES, segments: [], instruction: 'make the whole page dark mode' },
    check: (f) => /bg-(slate|zinc|gray|neutral|stone)-(8|9)\d\d|bg-black/.test(all(f)),
  },
];

describe.skipIf(!LIVE)('live edit eval (spec §9.2 edit success, with real AI)', () => {
  it('edits the sample page', async () => {
    process.loadEnvFile('.env.local');
    const { selectProvider } = await import('@/server/ai/provider');
    const selected = selectProvider(process.env);
    if (!selected.ok) throw new Error(selected.error);

    const results = [];
    for (const c of CASES) {
      const started = Date.now();
      const response = await editProject(c.request, selected.provider.generate, AbortSignal.timeout(EDIT_TIMEOUT_MS)).catch(
        (err: unknown) => ({ ok: false as const, error: String(err) }),
      );
      results.push({
        name: c.name,
        ok: response.ok && c.check(response.files),
        ms: Date.now() - started,
        error: response.ok ? '' : response.error,
      });
    }
    const times = results.map((r) => r.ms).sort((a, b) => a - b);
    const report = {
      model: selected.provider.model,
      successRate: results.filter((r) => r.ok).length / results.length,
      medianMs: times[Math.floor(times.length / 2)],
      results,
    };
    mkdirSync('.eval', { recursive: true });
    writeFileSync('.eval/edits-latest.json', JSON.stringify(report, null, 2));
    // 5 cases: one miss is 80%. The 90% target applies to the full recorded set (M2b).
    expect(report.successRate, JSON.stringify(results, null, 2)).toBeGreaterThanOrEqual(0.8);
  }, 600_000);
});
```

In `package.json` `scripts`, add `"eval:edits": "EVAL_LIVE=1 vitest run src/server/edit/editProject.live.test.ts"`. Add `.eval/` to `.gitignore`.

- [ ] **Step 2: Run the live edit eval**

Run: `npm run eval:edits && cat .eval/edits-latest.json`
Expected: PASS (success rate ≥ 0.8). Record `medianMs` in the final report. The spec target is a median of **≤ 8 s** from Send to render, so if `medianMs` is above 8000, say so plainly rather than hiding it.

- [ ] **Step 3: Verify the full loop in the browser**

With `npm run dev` running on the sample page (or on a page built from a sketch), do each of the following. Check that the badge and highlight are right before pressing Send, then check the rendered result:
1. Circle the nav, type `1 smaller`, press ⌘↵. The status reads `Understood ① → editing Header.tsx…`, then the summary. The nav shrinks and the circle disappears.
2. Press ⌘Z once. The old page comes back **and** so does the circle.
3. Draw a pen arrow at the button and type `green`. The button turns green.
4. Draw an X over the paragraph and send with no text. The paragraph is gone.
5. Underline the headline and type `bigger`. The headline grows.
6. Draw a rectangle across the hero/section boundary, write `Testimonials` inside it with the text tool, and type `add 3 cards`. A testimonials section appears between them.
7. Two marks in one instruction: circle the nav and cross out the button, then type `1 bold`. Both changes apply.
8. While a send is in flight, draw a new circle. It stays on the board, numbered **1**, after the result lands.
9. Drag the page somewhere else and circle the nav again. The highlight lands on the nav.

- [ ] **Step 4: Record at least 10 real eval cases**

For varied real marks on 2–3 different built pages (including a screenshot-built one):
- Click **Save as eval case**.
- Open the downloaded JSON, correct `expected` wherever the plan was wrong, and move it into `src/marks/evals/cases/`.

Then run `npx vitest run src/marks/evals`.
Expected: accuracy ≥ 0.9. If a heuristic misses, fix the heuristic in `classify.ts` or `hitTest.ts` with a new unit test. Never loosen the eval or edit a case's `expected` to match a wrong answer.

- [ ] **Step 5: Record the decisions in the spec**

In `docs/superpowers/specs/2026-09-28-drawai-v1-design.md`:
- In §11, replace M2's line with two lines: **M2a: point and edit** (the list from this plan's Goal) and **M2b: voice** (recording, streaming STT, word binding, draw/interact mode, recorded golden set with word logs).
- Add a short "Changed in M2a" note under §6.2 (text edit blocks, Decision 2) and under §5.2 (ink image instead of page crop, Decision 3).
- Under §2.2, note that marks are deleted with ⌘Z restore until M3 versions (Decision 4).

- [ ] **Step 6: Final checks and commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.
```bash
git add -A src package.json .gitignore docs
git commit -m "test(eval): live edit eval, recorded targeting cases; record M2a decisions in the spec"
```
