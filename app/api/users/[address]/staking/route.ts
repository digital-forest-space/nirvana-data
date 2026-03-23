import { NextRequest, NextResponse } from 'next/server';
import { getRpcUrl, isValidPublicKey } from '@/lib/solana/rpc';
import { fetchPersonalAccount } from '@/lib/solana/personalAccount';
import { fetchFloorPrice } from '@/lib/solana/nirvana';

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

    const [personalAccount, floorPrice] = await Promise.all([
      fetchPersonalAccount(address, rpcUrl),
      fetchFloorPrice(rpcUrl).catch(() => 0),
    ]);

    if (!personalAccount) {
      return NextResponse.json({ error: 'Personal account not found for this wallet' }, { status: 404 });
    }

    const borrowableNirv = (() => {
      const limit = personalAccount.stakedAna * floorPrice;
      return limit > personalAccount.debt ? limit - personalAccount.debt : 0;
    })();

    return NextResponse.json({
      accountAddress: personalAccount.address,
      stakedAna: personalAccount.stakedAna,
      stakedPrana: personalAccount.stakedPrana,
      debtNirv: personalAccount.debt,
      borrowableNirv,
      claimableAnaRevshare: personalAccount.stagedClaimableAna,
      claimableNirvRevshare: personalAccount.stagedClaimableNirv,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
