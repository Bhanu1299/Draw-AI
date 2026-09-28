import type Anthropic from '@anthropic-ai/sdk';
import { ALLOWED_PACKAGES } from '@/preview/runtimeHtml';
import type { BuildRequest } from '@/shared/types';

const IMPORTABLE = ALLOWED_PACKAGES.filter((p) => p !== 'react/jsx-runtime').join(', ');

export const BUILD_SYSTEM_PROMPT = `You turn a whiteboard sketch or a screenshot into a single web page built with React and Tailwind CSS.

Output format (follow exactly):
- Write every file as <file path="PATH">CODE</file>. PATH is relative, like App.tsx or components/Hero.tsx.
- After the files, write one line: <summary>one short sentence describing what you built</summary>.
- Write nothing else: no markdown fences, no explanations.

Code rules:
- App.tsx default-exports the page component. Put each page section in its own components/Name.tsx file with a default export.
- Use TypeScript function components. Style only with Tailwind CSS v4 utility classes.
- You may import only: ${IMPORTABLE}, and relative imports between your own files. No CSS files and no other packages.
- For images, use https://placehold.co/WIDTHxHEIGHT placeholder URLs.
- Design for a 1280px wide desktop viewport. Never use viewport-height units (vh, dvh, svh or h-screen): the preview grows to fit the page, so use fixed heights like min-h-[800px] instead.

How to read the input:
- sketch: boxes are layout regions, handwritten words are content or labels, and arrows or notes are instructions to you, not content to show. Fill gaps with sensible, realistic content.
- screenshot: reproduce the layout, colors, typography, spacing and visible text as faithfully as you can.`;

export function buildUserContent(req: BuildRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const note = req.note.trim();
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: req.imageBase64 } },
    { type: 'text', text: `Input type: ${req.kind}.${note ? `\nUser note: ${note}` : ''}\nBuild the page.` },
  ];
}

export function buildFixPrompt(errors: string[]): string {
  return `These problems stop the page from compiling:
${errors.map((e) => `- ${e}`).join('\n')}
Return corrected versions of only the files that need changes, in the same <file> format, then the <summary> line.`;
}
