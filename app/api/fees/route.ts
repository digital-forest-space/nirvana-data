import { NextResponse } from 'next/server';
import { getMarketFees } from '@/lib/prices/marketFees';

export async function GET() {
  try {
    const fees = await getMarketFees();
    return NextResponse.json(fees);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
