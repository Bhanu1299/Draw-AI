import type Anthropic from '@anthropic-ai/sdk';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { parseFiles, parseSummary } from './parseFiles';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';
import { validateProject } from './validateProject';

/** Sends a conversation to the model and returns its text. Injected so tests never call the API. */
export type Generate = (args: { system: string; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<string>;

export async function buildProject(req: BuildRequest, generate: Generate): Promise<BuildResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: buildUserContent(req) }];
  const first = await generate({ system: BUILD_SYSTEM_PROMPT, messages });
  const files = parseFiles(first);
  let summary = parseSummary(first);
  let result = validateProject(files);

  if (!result.ok) {
    const retryMessages: Anthropic.Beta.BetaMessageParam[] = [
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: buildFixPrompt(result.errors) },
    ];
    const second = await generate({ system: BUILD_SYSTEM_PROMPT, messages: retryMessages });
    // The fix may return only the changed files, so merge over the first attempt.
    // Leftovers the fixed page no longer imports are dropped by validateProject.
    summary = parseSummary(second) ?? summary;
    result = validateProject({ ...files, ...parseFiles(second) });
    if (!result.ok) return { ok: false, error: `Couldn't build a working page: ${result.errors[0]}` };
  }

  return { ok: true, files: result.files, summary: summary ?? 'Built the page.' };
}
