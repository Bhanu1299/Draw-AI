# DrawAI v1 — Design Spec

**Date:** 2026-09-28
**Status:** Draft, awaiting owner review
**One-liner:** A whiteboard where your sketch becomes real UI. You draw on or around a live web page, talk while you draw, and the AI makes exactly the change you pointed at.

---

## 1. Product

### 1.1 Who it's for
Designers and developers. It is a product for other people, not an internal tool.

### 1.2 The core insight
**Pointing beats describing.** Chat tools make you describe *where* in words ("the second button in the right card"). In DrawAI, the pen says *where* and your voice says *what*.

### 1.3 Positioning
Click-an-element-and-prompt editing is already common (Lovable, v0, Onlook, Stagewise). DrawAI wins on what only a whiteboard can do:
- **Sketch new UI onto an existing page.** Draw a box between two sections and say "testimonials here". There is nothing to click yet, so click tools can't express this.
- **Several instructions in one breath.** Each one is numbered ①②③ and bound to its own mark.
- **Space to think.** Notes, sketches and references sit around the page.

### 1.4 Scope of v1
It does design and UI only. It is not a general chatbot, and there is no Q&A mode in v1.

### 1.5 Success criteria for v1
- **Targeting accuracy:** at least 90% of marks resolve to the element the user meant, measured on the eval set in §9.2.
- **Edit success:** at least 90% of instructions produce code that compiles and renders, with at most one automatic fix attempt.
- **Latency:** median time from pressing ■ Stop to seeing the updated render is 8 seconds or less. Progress is shown the whole time.
- **Cost:** the median cost per instruction is tracked and shown in the admin log. The budget is enforced by per-user daily limits.

---

## 2. User experience

### 2.1 Layout (chosen: infinite whiteboard)
- An endless tldraw canvas. The live page is a **frame** on the board and renders at 1280px desktop width, scaled.
- The user draws **on** the frame (edits) and **around** it (new sections, notes, pasted images).
- A **floating toolbar** at the bottom holds pen, ellipse, arrow, rectangle, sticky note, eraser, the mic toggle and undo.
- A **transcript panel** on the right lists the numbered segments ①②③, and the same numbers appear as badges on the canvas.
- **Draw mode vs. interact mode (`I` key):**
  - In draw mode (the default) the page ignores the pointer, so every stroke is ink.
  - In interact mode you can click links and buttons inside the page. Ink is disabled.

### 2.2 The instruction loop
1. Click **● Start**. The mic is live and the button turns into **■ Stop** with a timer.
2. Talk and draw freely, in any order and in any amount.
3. Click **■ Stop**. The panel immediately shows the numbered segments and highlights each mark's target elements. This happens locally and needs no AI.
4. The instruction is sent automatically, with no extra confirm step. A status line shows progress: `Understood ①② → editing Header.tsx, Hero.tsx…`
5. The frame re-renders and a new version is saved.
6. **Undo (⌘Z / toolbar)** reverts to the previous version in one click.

**Decision: send automatically, don't confirm first.** Speed is what makes it feel magical, and cheap undo makes mistakes painless. The panel still shows exactly what was understood, so a misread is visible right away.

After an instruction is applied, its marks fade and are archived: hidden, but kept in the version record. This keeps the board clean.

> **Changed in M2a:** until M3 adds the `versions` table, sent marks are deleted in the same undo step as the edit, so one ⌘Z brings back both the old page and the marks.

### 2.3 Three ways to start
| Start | What happens | v1 milestone |
|---|---|---|
| **Blank canvas** | Draw a wireframe with shapes or the pen. In M1 you select it and click **Build**, with an optional typed note. From M2 you can also click ● Start and speak, and ■ Stop builds it. The build creates a frame next to the sketch. | M1 |
| **Drop a screenshot** | The image lands on the board. "Build this" (button or voice) makes the AI rebuild it as React + Tailwind in a new frame beside it. | M1 |
| **Paste a URL** | A server-side headless browser captures a full-page screenshot and cleaned HTML/CSS, and the AI rebuilds the page as React + Tailwind. | M4 |

Imports are presented as "start from a reference", not "clone this site".

### 2.4 Export
- **Download ZIP:** a ready-to-run Vite + React + Tailwind project. The `data-src` tags are never in exported code because they're injected only at preview time.
- **Copy code** for a single file.

---

## 3. Architecture

```
BROWSER                                          SERVER (Next.js)                 EXTERNAL
┌──────────────────────────────────────┐        ┌──────────────────────────┐
│ Recorder ── audio ────────────────────────────▶ STT token mint  ─────────▶ Speech-to-text (streaming,
│   └ strokes + timestamps             │        │                          │   word timestamps)
│ Segmenter  (words+strokes → ①②③)     │        │                          │
│ Gesture classifier                   │        │                          │
│ Hit-tester (strokes → elements)      │        │                          │
│ Prompt compiler ── compact text ─────────────▶ Edit API                 ─▶ Claude
│                                      │        │  limits · apply · verify │
│ Preview frame (sandboxed iframe)  ◀── files ── │  versions · usage log    │
│   Babel + data-src tagging           │        └──────────┬───────────────┘
│   Tailwind browser build             │                   │
└──────────────────────────────────────┘             Supabase (auth, Postgres, storage)
                                                    URL-capture worker (Playwright) — M4
```

**Principle: the browser does the cheap, precise work** (segmenting, geometry, hit-testing, compiling the prompt). **The server holds the secrets and the AI calls.** The AI only ever receives compact text plus relevant code, and an image only when needed.

### 3.1 Tech stack
| Concern | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript on Vercel | One codebase for UI and API; fast to ship |
| Canvas | **tldraw** | Custom shapes (live iframe frame), native arrows/ellipses/pen, snapshot persistence. **Risk:** production use needs a tldraw license, so confirm the cost before public launch (§10). |
| Preview compile | `@babel/standalone` + custom JSX plugin, ES modules from `esm.sh` | Runs in the browser with no server build; the plugin injects `data-src` |
| Styling in preview | Tailwind browser build (v4) | No build step per edit |
| Speech-to-text | Streaming STT with per-word timestamps (default: Deepgram) | The transcript is ready the moment you press Stop, and word timings enable binding marks to words. Pick the exact provider at planning. |
| AI | **DeepSeek `deepseek-flash`** (default; its only model that takes images) via its OpenAI-compatible API, with Claude (`claude-opus-5`) selectable by `AI_PROVIDER=anthropic`. The pipeline speaks provider-neutral chat types, and each provider has a small adapter. Tall images are sent as 1280px slices because DeepSeek shrinks each image to about 1300px. | Owner decision (2026-09-28): much lower cost per build. Keeping Claude switchable allows quality comparisons. |
| Auth / DB / storage | Supabase (magic link + GitHub OAuth, Postgres, Storage) | Auth plus database plus file storage in one service |
| URL capture (M4) | Small Playwright worker on Fly.io or Railway | Serverless can't comfortably run Chromium |

### 3.2 Generated project shape
Each frame is one page. The files are kept as a map from file path to file contents:
```
App.tsx                 // composes the sections
components/Header.tsx
components/Hero.tsx
components/Pricing.tsx
...
```
- Allowed imports: `react` and `lucide-react` only, enforced in the AI prompt and by the compiler.
- If you need several pages, you create several frames.

---

## 4. Recording and segmentation

### 4.1 Capture
- **Audio:** streamed to the STT provider over a short-lived token issued by our server, so the provider key never reaches the browser.
- **Strokes:** each tldraw shape the user creates while recording is logged as `{shapeId, type, points (page coordinates), tStart, tEnd}`.
  - Shapes made with tools (ellipse, arrow, rectangle, note) keep their type.
  - Freehand pen strokes are classified in §5.1.
- **Words:** `{text, tStart, tEnd}` from the STT output.

### 4.2 Building the numbered segments
1. **Group strokes into marks.** Consecutive strokes with a gap under 1.2 s *and* bounding boxes within 80px of each other become one mark (so a circle plus an arrow drawn together count as one mark).
2. **Attach words to marks.** A word belongs to a mark if its time overlaps the mark's window `[tStart − 0.4s, tEnd + 0.4s]`.
3. **Collect speech-only runs.** Words that aren't attached to any mark form speech-only segments, which are split wherever a mark falls between them.
4. **Number everything** in time order: ①②③…
5. **Show it.** Each mark gets a number badge on the canvas and each segment gets a row in the transcript panel.

Segments are *context, not strict commands*. The AI sees them in order, so "these ones… move them right" (a mark segment followed by a speech segment) is resolved by the model.

---

## 5. Understanding marks

### 5.1 Gesture classification (geometry, no AI)
| Gesture | Rule (for freehand strokes) | Means |
|---|---|---|
| **Circle / lasso** | The gap between start and end is under 25% of the stroke's length, and the enclosed area is meaningful | "these elements" |
| **Arrow** | A tldraw arrow, or a mostly straight stroke with a head-shaped end | "this element", or "move from A to B" when it starts on one element and ends on another |
| **Cross-out** | An X shape or a zigzag with 3 or more direction reversals over an element | "remove / replace this" |
| **Underline** | A roughly horizontal line whose height is under 15% of its width, sitting just below an element | "this text" |
| **Sketch** | Rectangles, text or anything else in an empty area, or boxes drawn over the page as a new layout | "new UI here" |

A tldraw tool shape (ellipse, arrow, rectangle) skips classification and uses its own type.

### 5.2 Hit-testing (which elements a mark means)
- **Element positions:** the preview iframe reports every tagged element's rectangle (`data-src`, tag, short text, rectangle) through `postMessage` after each render and resize. The frame's transform converts those rectangles into canvas coordinates.
- **Circle:** the candidates are elements with at least 70% of their area inside the loop. Drop a candidate if its parent is also a candidate. If there are no candidates, take the element with the largest overlap.
- **Arrow:** the target is the smallest meaningful element (at least 12×12px) under the arrowhead. If the tail sits on an element, record it as the move source.
- **Cross-out / underline:** the smallest element whose rectangle contains most of the mark's bounding box, or which sits directly above it for an underline.
- **Sketch:** describe it as a *new region*: its size and its position relative to neighbouring elements (for example, "between `<Hero>` and `<Pricing>`, full width, ~300px tall") or relative to the frame (for example, "to the right of the page").
- **Low confidence:** if a mark hits nothing or best overlap is under 40%, attach a **small cropped PNG** of the area around the mark (max 512px) instead of a full screenshot.

> **Changed in M2a:** tldraw can't rasterize the preview iframe, so instead of a page crop, unsure marks and freehand sketches attach a ≤512px PNG of the ink alone, plus a geometric description of where it sits.

### 5.3 The `data-src` tags
The preview's Babel plugin adds `data-src="components/Header.tsx:18:4"` to every HTML-level JSX element at compile time.
- Because the AI never writes these tags, they are always correct.
- They exist only in the preview; exported code is clean.

---

## 6. Prompt compilation and AI edits

### 6.1 What the AI receives
```
Project: acme-landing (React + Tailwind, files: App.tsx, components/Header.tsx, …)
① CIRCLED → <nav> links [components/Header.tsx:18-24]
   said: "make these smaller"
② SKETCH new region between <Hero> [components/Hero.tsx] and <Pricing> [components/Pricing.tsx], full width, ~300px tall
   said: "add three testimonial cards here"
③ said: "and make the whole thing feel more premium"

--- components/Header.tsx (full file) ---
--- components/Hero.tsx (full file) ---
...
```
- **Which files go in:** every file that contains a target, plus `App.tsx`. Other files appear only as a list of names.
- **When the whole project goes in:** only if an instruction is global ("more premium") and the project is under roughly 40k tokens.
- **When there are images:** crops are attached only in the low-confidence case described in §5.2.
- **The stable system prompt:** rules, allowed imports, and edit-tool definitions. It is sent with prompt caching.

> **Changed in M2a:** a project under ~40k tokens (160,000 characters) always goes in whole, marks or not, since a marked instruction can still be global and a model that can't see a file may overwrite it blindly. Above that size, only App.tsx and the files the marks point at go in.

### 6.2 What the AI returns (tool use)
The model can call three tools:
- `edit_file {path, old_string, new_string}`: an exact find-and-replace.
- `create_file {path, content}`
- `delete_file {path}`

It also returns a one-line `summary` for the status line. The model is told never to touch code outside what the segments point at unless an instruction is global.

> **Changed in M2a:** instead of tool use, the model returns text blocks: `<edit path><old>…</old><new>…</new></edit>`, `<file path>…</file>` and `<delete path/>`, then `<summary>`. One parser serves both DeepSeek and Claude, matching M1's `<file>` protocol. An `<old>` that doesn't match exactly falls back to whole-line matching that ignores indentation.

### 6.3 Apply and verify (server)
1. Apply the edits in order. If an `old_string` isn't found, send that error back to the model once.
2. Compile-check the whole project on the server with **the same Babel compiler the preview uses**, so there's one compiler and no drift between the check and the preview. This catches syntax errors, missing files and packages that aren't allowed. If it fails, send the error back once for a fix.
3. Return the new file map. The browser renders it. If the render hits a runtime error, the iframe reports it and the browser asks the server for **one** automatic fix.
4. If everything still fails, keep the previous version and show "Couldn't apply that. Try rephrasing or pointing more precisely". The instruction does not count against the user's limit.
5. On success, save the result as a new **version**.

---

## 7. Data model (Supabase / Postgres)

| Table | Key columns |
|---|---|
| `profiles` | id, email, is_admin, daily_limit (default 30), invited (bool) |
| `boards` | id, owner_id, title, tldraw_snapshot (jsonb, saved on a 2 s debounce), updated_at |
| `frames` | id, board_id, tldraw_shape_id, current_version_id |
| `versions` | id, frame_id, parent_version_id, files (jsonb: path → content), summary, created_at |
| `instructions` | id, frame_id, version_before, version_after, segments (jsonb), transcript, status, model, input_tokens, output_tokens, cost_usd, latency_ms |
| `usage_daily` | user_id, date, count |

- **Storage:** uploaded screenshots and URL captures.
- **Access:** every table uses row-level security so that users only see their own rows.

### Access and cost control
- **Invite-only at first:** the `invited` flag gates sign-in to the app, and there's a waitlist page for everyone else.
- **Daily limit:** each user has a daily instruction limit (default 30). It is checked before every AI call, and a failed instruction doesn't count against it.
- **Admin view:** a simple page listing cost per user per day.

---

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Mic permission denied | An inline prompt explains how to enable it. The user can still draw and type an instruction in the panel as a fallback. |
| STT fails or returns an empty transcript | "Didn't catch that". Marks stay on the board so the user can press ● Start and speak again. |
| Mark hits nothing | A low-confidence crop is attached (§5.2) and the badge shows a "?" style. |
| AI edit fails to apply or compile | One automatic retry at each stage (§6.3), then the old version is kept with a clear message, and the limit isn't charged. |
| AI takes longer than 45 s | Cancel, keep the old version, and show "Took too long, try a smaller change". |
| Daily limit reached | The mic button is disabled and shows the reset time. |
| Reference import fails (M4: blocked site, login wall) | Suggest dropping a screenshot instead. |
| Network drop mid-instruction | The instruction is idempotent by id. On reconnect the client fetches its status. |

---

## 9. Testing

### 9.1 Unit tests (TDD, pure functions)
These cover the segmenter, the gesture classifier, the hit-tester, the prompt compiler, the edit applier, and the Babel `data-src` plugin. They are all pure TypeScript functions with fixture inputs.

### 9.2 Evals: the golden set
- **What it contains:** 30 or more recorded instructions (a stroke log, a word log and a project snapshot), with the expected target elements and a checklist for the expected result.
- **What we measure:** targeting accuracy is measured without AI; edit success is measured with live AI.
- **When it runs:** before any change to the prompt, the model or the heuristics.

### 9.3 End-to-end
Playwright tests of the main loop with a mocked STT feed and mocked AI responses: draw, then segment, then compile, then apply, then render, then undo.

---

## 10. Risks
| Risk | Mitigation |
|---|---|
| tldraw production license cost | Confirm pricing before public launch. Excalidraw (MIT) is the fallback, but it costs extra work for the custom live frame. |
| Speech-to-text or gestures misread | Visible numbered badges and highlights, cheap undo, and the golden eval set |
| Latency kills the magic | Streaming STT, the text-only prompt, targeted edits, and a live status line. Instant edits that skip the AI are in the deferred list. |
| API costs, since the owner pays | Invite-only access, daily limits, a per-instruction cost log, and prompt caching |
| URL import legality and optics | Present it as "start from a reference", and support only public pages |

---

## 11. Milestones
1. **M1: Board + build.** tldraw board, the live preview frame shape (Babel + Tailwind + `data-src`), blank-canvas sketch → build, and screenshot → build. In M1 the frame's files live in the shape itself, so tldraw's undo and local browser persistence act as versioning. **M1 runs locally only**; don't deploy it publicly before M3 adds auth and limits.
2. **M2: The edit loop**, built in two parts:
   - **M2a: point and edit.** Marks on the live page, numbered badges and target highlights, the gesture classifier, hit-testing, a typed instruction, the prompt compiler, the edit API with apply/verify/retry and a 45 s timeout, one-step undo, the automatic runtime fix, and the targeting eval.
   - **M2b: voice.** Recording, streaming STT, word-to-mark binding, draw/interact mode (`I` key), and the recorded golden set with word logs.
3. **M3: Product shell.** Supabase auth (invite-only), board and version persistence, daily limits, the usage/admin log, and ZIP export.
4. **M4: URL import.** The Playwright capture worker and the HTML+screenshot → React + Tailwind conversion.

---

## 12. Deferred (not in v1; stored for later)
1. **Variations side by side:** "3 versions of this hero" as live frames, where you circle the winner.
2. **Visible history frames:** every version on the board as a timeline, with branching from any version.
3. **Instant no-AI edits and model routing:** simple Tailwind class swaps in under 100 ms, a cheap model for medium edits, and a large model for structural changes.
4. **Live understanding:** badges and highlights appear while the user is still talking. A hands-free, always-listening mode also belongs here.
5. **Phase 2, codebase mode:** a browser overlay on the user's running localhost app, where marks become real edits in their repo.
6. **Also later:** subscriptions or bring-your-own-key billing, a Q&A mode, Figma export, mobile/tablet viewports, and real-time multiplayer.
