/** Map of project-relative path (e.g. "components/Hero.tsx") to file contents. */
export type ProjectFiles = Record<string, string>;

export type BuildKind = 'sketch' | 'screenshot';

export interface BuildRequest {
  kind: BuildKind;
  /** PNG images, base64 without the data: prefix. Several = horizontal slices of one tall image, top to bottom. */
  images: string[];
  note: string;
}

export type BuildResponse =
  | { ok: true; files: ProjectFiles; summary: string }
  | { ok: false; error: string };

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
  /** What the user said, in time order (voice instructions). */
  speech?: SpeechRun[];
  /** Set to ask for a fix after the edited page crashed in the preview. */
  runtimeError?: string;
}

export type EditResponse = BuildResponse;

/** Consecutive spoken words. `mark` is the number of the mark drawn while they were said, or null. */
export interface SpeechRun {
  mark: number | null;
  text: string;
}
