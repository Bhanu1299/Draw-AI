/** Map of project-relative path (e.g. "components/Hero.tsx") to file contents. */
export type ProjectFiles = Record<string, string>;

export type BuildKind = 'sketch' | 'screenshot';

export interface BuildRequest {
  kind: BuildKind;
  /** PNG image, base64 without the data: prefix. */
  imageBase64: string;
  note: string;
}

export type BuildResponse =
  | { ok: true; files: ProjectFiles; summary: string }
  | { ok: false; error: string };
