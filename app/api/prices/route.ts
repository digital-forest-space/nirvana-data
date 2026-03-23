import { NextRequest, NextResponse } from 'next/server';
import { getRpcUrl } from '@/lib/solana/rpc';
import { createAnaStrategy, createNavMarketStrategy, MarketPriceStrategy } from '@/lib/prices/marketStrategy';
import { fetchMarketPrice, MarketResult } from '@/lib/prices/fetchMarketPrice';
import { loadMarkets } from '@/lib/markets';

const CONCURRENCY_LIMIT = 3;

async function runWithConcurrency(
  strategies: MarketPriceStrategy[],
  rpcUrl: string
): Promise<Map<string, MarketResult>> {
  const results = new Map<string, MarketResult>();
  let index = 0;

  async function worker(): Promise<void> {
    while (index < strategies.length) {
      const current = index++;
      const strategy = strategies[current];
      const result = await fetchMarketPrice(strategy, rpcUrl);
      results.set(strategy.marketName, result);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, strategies.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const rpcUrl = getRpcUrl();

    // Parse optional market filter
    const marketsParam = request.nextUrl.searchParams.get('markets');
    const filter = marketsParam
      ? new Set(marketsParam.split(',').map((m) => m.trim()).filter(Boolean))
      : null;

    // Build strategy list
    const strategies: MarketPriceStrategy[] = [];

    if (!filter || filter.has('ANA')) {
      strategies.push(createAnaStrategy());
    }

    const navMarkets = await loadMarkets();
    for (const market of navMarkets) {
      if (!filter || filter.has(market.name)) {
        strategies.push(createNavMarketStrategy(market));
      }
    }

    if (strategies.length === 0) {
      return NextResponse.json({});
    }

    const results = await runWithConcurrency(strategies, rpcUrl);

    const response: Record<string, MarketResult> = {};
    for (const [name, result] of results) {
      response[name] = result;
    }

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
