/**
 * Jupiter USD price fetcher with in-memory cache (60s TTL)
 * Uses Jupiter Price API v3
 */

import { MINTS, NATIVE_SOL_MINT } from '@/lib/solana/config';

const CACHE_TTL_MS = 60 * 1000;
const JUPITER_API_URL = 'https://api.jup.ag/price/v3';

// Token mints we want USD prices for
const TOKEN_MINTS: Record<string, string> = {
  SOL: NATIVE_SOL_MINT,
  USDC: MINTS.USDC,
  ANA: MINTS.ANA,
  NIRV: MINTS.NIRV,
  PRANA: MINTS.PRANA,
};

// Well-known base mints from nav markets
const NAV_BASE_MINTS: Record<string, string> = {
  WETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  ZEC: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
  cbBTC: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
};

const ALL_MINTS: Record<string, string> = { ...TOKEN_MINTS, ...NAV_BASE_MINTS };

interface CachedPrices {
  prices: Record<string, number>;
  fetchedAt: number;
}

let cache: CachedPrices | null = null;

function getApiKey(): string {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new Error('JUPITER_API_KEY not set');
  return key;
}

export async function getUsdPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  const mintAddresses = Object.values(ALL_MINTS);
  const ids = mintAddresses.join(',');

  const response = await fetch(
    `${JUPITER_API_URL}?ids=${ids}`,
    {
      headers: {
        'Accept': 'application/json',
        'x-api-key': getApiKey(),
      },
    }
  );

  if (!response.ok) {
    if (cache) return cache.prices;
    throw new Error(`Jupiter API error: ${response.status}`);
  }

  const data = await response.json() as
    Record<string, { usdPrice: number } | undefined>;

  const prices: Record<string, number> = {};

  for (const [symbol, mint] of Object.entries(ALL_MINTS)) {
    const entry = data[mint];
    if (entry?.usdPrice != null) {
      prices[symbol] = entry.usdPrice;
    }
  }

  cache = { prices, fetchedAt: Date.now() };
  return prices;
}
