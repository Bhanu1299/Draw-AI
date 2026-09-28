import { NextResponse } from 'next/server';
import { selectProvider } from '@/server/ai/provider';
import { userMessage } from '@/server/ai/userMessage';
import { buildProject } from '@/server/build/buildProject';
import { parseBuildRequest } from '@/server/build/parseBuildRequest';
import type { BuildResponse } from '@/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse<BuildResponse>> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseBuildRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const selected = selectProvider(process.env);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: 500 });
  const { provider } = selected;

  try {
    return NextResponse.json(await buildProject(parsed.value, provider.generate));
  } catch (err) {
    console.error(`[api/build] ${provider.name}/${provider.model}`, err);
    return NextResponse.json({ ok: false, error: userMessage(err, provider) }, { status: 502 });
  }
}
