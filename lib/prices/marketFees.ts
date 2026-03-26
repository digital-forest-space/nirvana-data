/**
 * On-chain fee fetcher with Turso DB cache (stale-while-revalidate, 6h TTL)
 *
 * NAV market fees: read from MarketGroup accounts (Mayflower program)
 *   - Byte offsets 106-121: buy/sell/borrow/exerciseOption as u32 LE
 *   - Units: micro-basis-points (ubps), 10_000 ubps = 1%
 *
 * ANA sell fee: read from Tenant account
 *   - Byte offset 585: u64 LE in milli-basis-points (mbps)
 *   - 1_000_000 mbps = 100%
 *
 * Governance voting runs on ~7-day periods. Fees change once at the tally,
 * then stay fixed. A 6h revalidation window keeps staleness short while
 * the single batched RPC call per revalidation is negligible cost.
 */

import { getMultipleAccounts, readU64 } from '@/lib/solana/samsara';
import { getRpcUrl } from '@/lib/solana/rpc';
import { TENANT_ACCOUNT } from '@/lib/solana/config';
import { db } from '@/lib/db';
import { feeCache, navMarkets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface MarketFees {
  market: string;
  buyFeeUbps: number;
  sellFeeUbps: number;
  borrowFeeUbps: number;
  exerciseOptionFeeUbps: number;
  buyFeePercent: number;
  sellFeePercent: number;
  borrowFeePercent: number;
  exerciseOptionFeePercent: number;
}

export interface AnaFees {
  market: 'ANA';
  sellFeeRatio: number;
  sellFeePercent: number;
}

export interface AllFees {
  ANA: AnaFees;
  navMarkets: Record<string, MarketFees>;
  fetchedAt: string;
}

function ubpsToPercent(ubps: number): number {
  return ubps / 10_000;
}

function parseMarketGroupFees(data: Buffer, marketName: string): MarketFees {
  const buyFeeUbps = data.readUInt32LE(106);
  const sellFeeUbps = data.readUInt32LE(110);
  const borrowFeeUbps = data.readUInt32LE(114);
  const exerciseOptionFeeUbps = data.readUInt32LE(118);

  return {
    market: marketName,
    buyFeeUbps,
    sellFeeUbps,
    borrowFeeUbps,
    exerciseOptionFeeUbps,
    buyFeePercent: ubpsToPercent(buyFeeUbps),
    sellFeePercent: ubpsToPercent(sellFeeUbps),
    borrowFeePercent: ubpsToPercent(borrowFeeUbps),
    exerciseOptionFeePercent: ubpsToPercent(exerciseOptionFeeUbps),
  };
}

function parseAnaSellFee(data: Buffer): AnaFees {
  const sellFeeMbps = Number(readU64(data, 585));
  const sellFeeRatio = sellFeeMbps / 1_000_000;
  return {
    market: 'ANA',
    sellFeeRatio,
    sellFeePercent: sellFeeRatio * 100,
  };
}

interface CachedFeesResult {
  fees: AllFees;
  stale: boolean;
}

async function getCachedFees(): Promise<CachedFeesResult | null> {
  const rows = await db.select().from(feeCache);
  if (rows.length === 0) return null;

  const oldest = Math.min(...rows.map((r) => r.updatedAt.getTime()));

  let anaFees: AnaFees = { market: 'ANA', sellFeeRatio: 0, sellFeePercent: 0 };
  const navFees: Record<string, MarketFees> = {};

  for (const row of rows) {
    if (row.market === 'ANA') {
      const ratio = row.sellFeeRatio ?? 0;
      anaFees = { market: 'ANA', sellFeeRatio: ratio, sellFeePercent: ratio * 100 };
    } else {
      const buy = row.buyFeeUbps ?? 0;
      const sell = row.sellFeeUbps ?? 0;
      const borrow = row.borrowFeeUbps ?? 0;
      const exercise = row.exerciseOptionFeeUbps ?? 0;
      navFees[row.market] = {
        market: row.market,
        buyFeeUbps: buy,
        sellFeeUbps: sell,
        borrowFeeUbps: borrow,
        exerciseOptionFeeUbps: exercise,
        buyFeePercent: ubpsToPercent(buy),
        sellFeePercent: ubpsToPercent(sell),
        borrowFeePercent: ubpsToPercent(borrow),
        exerciseOptionFeePercent: ubpsToPercent(exercise),
      };
    }
  }

  return {
    fees: {
      ANA: anaFees,
      navMarkets: navFees,
      fetchedAt: new Date(oldest).toISOString(),
    },
    stale: Date.now() - oldest >= CACHE_TTL_MS,
  };
}

async function cacheMarketFees(market: string, fees: MarketFees): Promise<void> {
  await db.insert(feeCache).values({
    market,
    buyFeeUbps: fees.buyFeeUbps,
    sellFeeUbps: fees.sellFeeUbps,
    borrowFeeUbps: fees.borrowFeeUbps,
    exerciseOptionFeeUbps: fees.exerciseOptionFeeUbps,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: feeCache.market,
    set: {
      buyFeeUbps: fees.buyFeeUbps,
      sellFeeUbps: fees.sellFeeUbps,
      borrowFeeUbps: fees.borrowFeeUbps,
      exerciseOptionFeeUbps: fees.exerciseOptionFeeUbps,
      updatedAt: new Date(),
    },
  });
}

async function cacheAnaFees(fees: AnaFees): Promise<void> {
  await db.insert(feeCache).values({
    market: 'ANA',
    sellFeeRatio: fees.sellFeeRatio,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: feeCache.market,
    set: {
      sellFeeRatio: fees.sellFeeRatio,
      updatedAt: new Date(),
    },
  });
}

let revalidating = false;

/**
 * Fetch fees from on-chain accounts and persist to DB cache.
 */
async function revalidateFees(): Promise<AllFees> {
  const rpcUrl = getRpcUrl();

  const markets = await db
    .select()
    .from(navMarkets)
    .where(eq(navMarkets.enabled, true));

  const marketGroupAddresses = markets.map((m) => m.marketGroup);
  const allAddresses = [...marketGroupAddresses, TENANT_ACCOUNT];
  const accounts = await getMultipleAccounts(allAddresses, rpcUrl);

  const navFees: Record<string, MarketFees> = {};
  for (let i = 0; i < markets.length; i++) {
    const account = accounts[i];
    if (!account || account.data.length < 122) continue;
    navFees[markets[i].name] = parseMarketGroupFees(account.data, markets[i].name);
  }

  const tenantAccount = accounts[accounts.length - 1];
  let anaFees: AnaFees = { market: 'ANA', sellFeeRatio: 0, sellFeePercent: 0 };
  if (tenantAccount && tenantAccount.data.length > 593) {
    anaFees = parseAnaSellFee(tenantAccount.data);
  }

  await cacheAnaFees(anaFees);
  for (const [name, fees] of Object.entries(navFees)) {
    await cacheMarketFees(name, fees);
  }

  return {
    ANA: anaFees,
    navMarkets: navFees,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Get market fees with stale-while-revalidate.
 *
 * Always returns cached data immediately if available. If the cache is
 * older than 6h, a background revalidation is triggered so the next
 * caller gets fresh data. Only does a synchronous fetch on cold cache.
 */
export async function getMarketFees(): Promise<AllFees> {
  const cached = await getCachedFees();

  if (cached && !cached.stale) {
    return cached.fees;
  }

  if (cached && cached.stale) {
    if (!revalidating) {
      revalidating = true;
      revalidateFees()
        .catch(() => {})
        .finally(() => { revalidating = false; });
    }
    return cached.fees;
  }

  // No cache — must fetch synchronously
  return await revalidateFees();
}
