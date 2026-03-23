import { NextResponse } from 'next/server';
import { getUsdPrices } from '@/lib/prices/jupiterPrices';

export async function GET() {
  try {
    const prices = await getUsdPrices();
    return NextResponse.json(prices);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
