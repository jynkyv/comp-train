import { NextResponse } from 'next/server';
import { setRouteWeather, setRouteTrack, setTrainTransfer, setPeakMode, resetAll } from '@/lib/mockState';
import type { WeatherType, TrackCondition } from '@/lib/mockState';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.type === 'routeWeather') {
      setRouteWeather(body.routeId as string, body.weather as WeatherType);
    } else if (body.type === 'routeTrack') {
      setRouteTrack(body.routeId as string, body.condition as TrackCondition);
    } else if (body.type === 'trainTransfer') {
      setTrainTransfer(body.trainId as string, body.hasTransfer as boolean);
    } else if (body.type === 'peak') {
      setPeakMode(body.value as boolean | null);
    } else if (body.type === 'reset') {
      resetAll();
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
