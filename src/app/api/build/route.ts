import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { BuildError, generateWithClaude } from '@/server/ai/generateWithClaude';
import { buildProject } from '@/server/build/buildProject';
import { parseBuildRequest } from '@/server/build/parseBuildRequest';
import type { BuildResponse } from '@/shared/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse<BuildResponse>> {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseBuildRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  try {
    return NextResponse.json(await buildProject(parsed.value, generateWithClaude));
  } catch (err) {
    console.error('[api/build]', err);
    return NextResponse.json({ ok: false, error: userMessage(err) }, { status: 502 });
  }
}

function userMessage(err: unknown): string {
  if (err instanceof BuildError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return 'The server AI key is missing or invalid. Check ANTHROPIC_API_KEY in .env.local.';
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check your internet connection.';
  return 'Something went wrong while building. Please try again.';
}
