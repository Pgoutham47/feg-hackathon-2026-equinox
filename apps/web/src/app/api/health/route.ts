import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Shallow — proves the Next runtime is alive. Backend health is /v1/readyz. */
export function GET() {
  return NextResponse.json({ status: 'ok', commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' });
}
