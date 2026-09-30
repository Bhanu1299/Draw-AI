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
