import { NextResponse } from 'next/server';
import { missingCredentialsError } from '@/server/ai/credentials';
import { generateWithClaude } from '@/server/ai/generateWithClaude';
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
  const credentialsError = missingCredentialsError(process.env);
  if (credentialsError) return NextResponse.json({ ok: false, error: credentialsError }, { status: 500 });

  try {
    return NextResponse.json(await buildProject(parsed.value, generateWithClaude));
  } catch (err) {
    console.error('[api/build]', err);
    return NextResponse.json({ ok: false, error: userMessage(err) }, { status: 502 });
  }
}
