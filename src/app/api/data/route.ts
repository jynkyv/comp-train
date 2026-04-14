import { NextResponse } from 'next/server';
import { getState } from '@/lib/mockState';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getState();
  return NextResponse.json(state);
}
