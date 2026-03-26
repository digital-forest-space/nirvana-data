/**
 * Shared paging/caching engine for market prices
 *
 * Works with any MarketPriceStrategy to fetch, parse, validate,
 * and cache market prices from Solana transaction history.
 */

import { getSignaturesForAddress } from '@/lib/solana/rpc';
import { MarketPriceStrategy } from './marketStrategy';
import { getCachedMarketPrice, setCachedMarketPrice, CachedMarketPrice } from './priceCache';

const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 20;
const MAX_PAGES = 10;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 10000;
const MAX_RETRIES = 5;

export interface MarketPriceResult {
  market: string;
  price: number;
  floor: number;
  currency: string;
  updatedAt: string;
  priceSignature: string;
  checkpointSignature: string;
}

export interface MarketPriceError {
  market: string;
  error: string;
}

export type MarketResult = MarketPriceResult | MarketPriceError;

export function isMarketPriceError(result: MarketResult): result is MarketPriceError {
  return 'error' in result;
}

type PriceStatus = 'found' | 'unchanged' | 'limitReached' | 'error';

interface PriceFetchResult {
  status: PriceStatus;
  price?: number;
  fee?: number;
  currency?: string;
  priceSignature?: string;
  newestCheckedSignature?: string;
  lastCheckedSignature?: string;
  errorMessage?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') || message.includes('rate limit') || message.includes('Too many requests');
}

async function fetchSinglePage(
  strategy: MarketPriceStrategy,
  rpcUrl: string,
  options: {
    afterSignature?: string;
    beforeSignature?: string;
  }
): Promise<{
  result: PriceFetchResult;
  signatures: Array<{ signature: string }>;
}> {
  const signatures = await getSignaturesForAddress(strategy.signatureAddress, rpcUrl, {
    limit: PAGE_SIZE,
    until: options.afterSignature,
    before: options.beforeSignature,
  });

  if (signatures.length === 0) {
    if (options.afterSignature) {
      return { result: { status: 'unchanged' }, signatures: [] };
    }
    return {
      result: { status: 'error', errorMessage: `No transactions found for ${strategy.marketName}` },
      signatures: [],
    };
  }

  const newestSig = signatures[0].signature;
  let lastCheckedSig: string | undefined;
  let currentDelay = INITIAL_DELAY_MS;

  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    lastCheckedSig = sig.signature;

    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
      try {
        if (i > 0 || retryCount > 0) {
          await sleep(currentDelay);
        }

        const result = await strategy.parseTransactionPrice(sig.signature, rpcUrl);
        if (result.found && result.price > 0) {
          return {
            result: {
              status: 'found',
              price: result.price,
              fee: result.fee,
              currency: result.currency,
              priceSignature: sig.signature,
              newestCheckedSignature: newestSig,
            },
            signatures,
          };
        }

        currentDelay = INITIAL_DELAY_MS;
        break;
      } catch (error) {
        if (isRateLimitError(error) && retryCount < MAX_RETRIES) {
          retryCount++;
          currentDelay = Math.min(currentDelay * 2, MAX_DELAY_MS);
          continue;
        }

        currentDelay = INITIAL_DELAY_MS;
        break;
      }
    }
  }

  return {
    result: {
      status: 'limitReached',
      newestCheckedSignature: newestSig,
      lastCheckedSignature: lastCheckedSig,
    },
    signatures,
  };
}

async function fetchWithPaging(
  strategy: MarketPriceStrategy,
  rpcUrl: string,
  options: { afterSignature?: string }
): Promise<PriceFetchResult> {
  let beforeSignature: string | undefined;
  let newestCheckedSig: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { result, signatures } = await fetchSinglePage(strategy, rpcUrl, {
      afterSignature: page === 0 ? options.afterSignature : undefined,
      beforeSignature,
    });

    if (page === 0 && result.newestCheckedSignature) {
      newestCheckedSig = result.newestCheckedSignature;
    }

    if (result.status !== 'limitReached') {
      if (!result.newestCheckedSignature && newestCheckedSig) {
        result.newestCheckedSignature = newestCheckedSig;
      }
      return result;
    }

    if (signatures.length === 0 || !result.lastCheckedSignature) break;
    beforeSignature = result.lastCheckedSignature;
  }

  return {
    status: 'limitReached',
    newestCheckedSignature: newestCheckedSig,
    errorMessage: `Exhausted max pages without finding price for ${strategy.marketName}`,
  };
}

function buildResult(cached: CachedMarketPrice): MarketPriceResult {
  return {
    market: cached.market,
    price: cached.price,
    floor: cached.floor,
    currency: cached.currency,
    updatedAt: cached.updatedAt.toISOString(),
    priceSignature: cached.priceSignature,
    checkpointSignature: cached.checkpointSignature,
  };
}

// In-flight revalidation tracking to avoid duplicate background fetches
const revalidating = new Set<string>();

/**
 * Perform the actual RPC fetch + cache update for a market.
 * Used both synchronously (cold cache) and as a background revalidation.
 */
async function revalidateMarketPrice(
  strategy: MarketPriceStrategy,
  rpcUrl: string,
  cached: CachedMarketPrice | null
): Promise<MarketResult> {
  const result = await fetchWithPaging(strategy, rpcUrl, {
    afterSignature: cached?.checkpointSignature,
  });

  if (result.status === 'found' && result.price) {
    const floorPrice = await strategy.fetchFloorPrice(rpcUrl);

    if (!strategy.validatePrice(result.price, floorPrice)) {
      if (cached) {
        const updatedCache: CachedMarketPrice = {
          ...cached,
          floor: floorPrice,
          checkpointSignature: result.newestCheckedSignature || cached.checkpointSignature,
          updatedAt: new Date(),
        };
        await setCachedMarketPrice(updatedCache);
        return buildResult(updatedCache);
      }

      return {
        market: strategy.marketName,
        error: `Parsed price ${result.price.toFixed(4)} failed validation (floor ${floorPrice.toFixed(4)})`,
      };
    }

    const newCache: CachedMarketPrice = {
      market: strategy.marketName,
      price: result.price,
      floor: floorPrice,
      fee: result.fee,
      currency: result.currency || strategy.currency,
      priceSignature: result.priceSignature!,
      checkpointSignature: result.newestCheckedSignature || result.priceSignature!,
      updatedAt: new Date(),
    };
    await setCachedMarketPrice(newCache);
    return buildResult(newCache);
  }

  if ((result.status === 'unchanged' || result.status === 'limitReached') && cached) {
    const floorPrice = await strategy.fetchFloorPrice(rpcUrl);

    const updatedCache: CachedMarketPrice = {
      ...cached,
      floor: floorPrice,
      checkpointSignature: result.newestCheckedSignature || cached.checkpointSignature,
      updatedAt: new Date(),
    };
    await setCachedMarketPrice(updatedCache);
    return buildResult(updatedCache);
  }

  return {
    market: strategy.marketName,
    error: result.errorMessage || `Failed to fetch price for ${strategy.marketName}`,
  };
}

/**
 * Fetch market price using the given strategy, with caching and paging.
 *
 * Stale-while-revalidate: if a cached price exists it is returned immediately,
 * even if stale. A background revalidation is kicked off when the cache TTL
 * has expired so the next caller gets fresh data.
 */
export async function fetchMarketPrice(
  strategy: MarketPriceStrategy,
  rpcUrl: string
): Promise<MarketResult> {
  try {
    const cached = await getCachedMarketPrice(strategy.marketName);
    const cacheAge = cached ? Date.now() - cached.updatedAt.getTime() : Infinity;

    // Fresh cache — return immediately
    if (cacheAge < CACHE_TTL_MS && cached) {
      return buildResult(cached);
    }

    // Stale cache — return it now, revalidate in background
    if (cached) {
      if (!revalidating.has(strategy.marketName)) {
        revalidating.add(strategy.marketName);
        revalidateMarketPrice(strategy, rpcUrl, cached)
          .catch(() => {})
          .finally(() => revalidating.delete(strategy.marketName));
      }
      return buildResult(cached);
    }

    // No cache at all — must fetch synchronously
    return await revalidateMarketPrice(strategy, rpcUrl, null);
  } catch (error) {
    return {
      market: strategy.marketName,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
