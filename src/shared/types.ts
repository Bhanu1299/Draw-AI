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
