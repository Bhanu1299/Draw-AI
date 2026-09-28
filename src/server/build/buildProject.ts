import type { ChatMessage, Generate } from '@/server/ai/chat';
import type { BuildRequest, BuildResponse } from '@/shared/types';
import { parseFiles, parseSummary } from './parseFiles';
import { BUILD_SYSTEM_PROMPT, buildFixPrompt, buildUserContent } from './prompt';
import { validateProject } from './validateProject';

export async function buildProject(req: BuildRequest, generate: Generate): Promise<BuildResponse> {
  const messages: ChatMessage[] = [{ role: 'user', content: buildUserContent(req) }];
  const first = await generate({ system: BUILD_SYSTEM_PROMPT, messages });
  const files = parseFiles(first);
  let summary = parseSummary(first);
  let result = validateProject(files);

  if (!result.ok) {
    const retryMessages: ChatMessage[] = [
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
