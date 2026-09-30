import { NextResponse } from 'next/server';
import { mintSttToken } from '@/server/stt/sttToken';
import type { SttTokenResponse } from '@/shared/types';

export const runtime = 'nodejs';

// Unauthenticated until M3: local use only (see the plan's Global Constraints).
export async function POST(): Promise<NextResponse<SttTokenResponse>> {
  const result = await mintSttToken(process.env);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
