import { NextResponse } from 'next/server';
import { setWeather, setPeakMode } from '@/lib/mockState';
import type { WeatherType } from '@/lib/mockState';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.type === 'weather') {
      setWeather(body.value as WeatherType | null);
    } else if (body.type === 'peak') {
      setPeakMode(body.value as boolean | null);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
