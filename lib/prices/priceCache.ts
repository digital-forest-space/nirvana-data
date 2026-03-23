/**
 * Per-market price cache using Turso/Drizzle
 */

import { db } from '@/lib/db';
import { priceCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface CachedMarketPrice {
  market: string;
  price: number;
  floor: number;
  fee?: number;
  currency: string;
  priceSignature: string;
  checkpointSignature: string;
  updatedAt: Date;
}

export async function getCachedMarketPrice(market: string): Promise<CachedMarketPrice | null> {
  const rows = await db.select().from(priceCache).where(eq(priceCache.market, market)).limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    market: row.market,
    price: row.price,
    floor: row.floor,
    fee: row.fee ?? undefined,
    currency: row.currency,
    priceSignature: row.priceSignature,
    checkpointSignature: row.checkpointSignature,
    updatedAt: row.updatedAt,
  };
}

export async function setCachedMarketPrice(data: CachedMarketPrice): Promise<void> {
  await db.insert(priceCache).values({
    market: data.market,
    price: data.price,
    floor: data.floor,
    fee: data.fee ?? null,
    currency: data.currency,
    priceSignature: data.priceSignature,
    checkpointSignature: data.checkpointSignature,
    updatedAt: data.updatedAt,
  }).onConflictDoUpdate({
    target: priceCache.market,
    set: {
      price: data.price,
      floor: data.floor,
      fee: data.fee ?? null,
      currency: data.currency,
      priceSignature: data.priceSignature,
      checkpointSignature: data.checkpointSignature,
      updatedAt: data.updatedAt,
    },
  });
}
