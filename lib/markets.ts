/**
 * Nav market types and data access
 */

import { db } from '@/lib/db';
import { navMarkets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface NavMarketInfo {
  name: string;
  baseName: string;
  baseMint: string;
  navMint: string;
  samsaraMarket: string;
  mayflowerMarket: string;
  marketMetadata: string;
  marketGroup: string;
  marketSolVault: string;
  marketNavVault: string;
  feeVault: string;
  authorityPda: string;
  baseDecimals: number;
  navDecimals: number;
}

/**
 * Load enabled markets from Turso
 */
export async function loadMarkets(): Promise<NavMarketInfo[]> {
  const rows = await db.select().from(navMarkets).where(eq(navMarkets.enabled, true));
  return rows.map(({ enabled: _, ...rest }) => rest);
}
