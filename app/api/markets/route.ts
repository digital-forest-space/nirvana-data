import { NextResponse } from 'next/server';
import { loadMarkets } from '@/lib/markets';

export async function GET() {
  try {
    const markets = await loadMarkets();
    return NextResponse.json({ markets });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
