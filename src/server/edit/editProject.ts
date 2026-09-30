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
