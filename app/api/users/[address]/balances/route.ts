import { NextRequest, NextResponse } from 'next/server';
import { getRpcUrl, getTokenAccountsByOwner, isValidPublicKey } from '@/lib/solana/rpc';
import { MINTS } from '@/lib/solana/config';

interface TokenBalanceResult {
  balance: number;
  account: string | null;
}

async function fetchTokenBalance(
  owner: string,
  mint: string,
  rpcUrl: string
): Promise<TokenBalanceResult> {
  try {
    const accounts = await getTokenAccountsByOwner(owner, mint, rpcUrl);
    if (accounts.length === 0) {
      return { balance: 0, account: null };
    }
    const balance = accounts.reduce((sum, account) => {
      const amount = parseFloat(account.amount) / Math.pow(10, account.decimals);
      return sum + amount;
    }, 0);
    return { balance, account: accounts[0].pubkey };
  } catch {
    return { balance: 0, account: null };
  }
}

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

    const [ana, nirv, usdc, prana] = await Promise.all([
      fetchTokenBalance(address, MINTS.ANA, rpcUrl),
      fetchTokenBalance(address, MINTS.NIRV, rpcUrl),
      fetchTokenBalance(address, MINTS.USDC, rpcUrl),
      fetchTokenBalance(address, MINTS.PRANA, rpcUrl),
    ]);

    return NextResponse.json({
      ana: { balance: ana.balance, account: ana.account },
      nirv: { balance: nirv.balance, account: nirv.account },
      usdc: { balance: usdc.balance, account: usdc.account },
      prana: { balance: prana.balance, account: prana.account },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
