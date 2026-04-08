import { NextResponse } from 'next/server';
import { tick } from '@/lib/mockState';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = tick();
  return NextResponse.json(state);
}
