import { NextRequest, NextResponse } from 'next/server';
import { getRpcUrl, isValidPublicKey } from '@/lib/solana/rpc';
import { findPersonalAccount } from '@/lib/solana/personalAccount';
import { simulateClaimablePrana } from '@/lib/solana/simulation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!isValidPublicKey(address)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const rpcUrl = getRpcUrl();

    const personalAccountAddress = await findPersonalAccount(address);
    if (!personalAccountAddress) {
      return NextResponse.json({ error: 'Personal account not found for this wallet' }, { status: 404 });
    }

    const amount = await simulateClaimablePrana(rpcUrl, address, personalAccountAddress);

    return NextResponse.json({
      token: 'PRANA',
      amount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
