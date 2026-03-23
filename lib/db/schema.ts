import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const priceCache = sqliteTable('price_cache', {
  market: text('market').primaryKey(),
  price: real('price').notNull(),
  floor: real('floor').notNull(),
  fee: real('fee'),
  currency: text('currency').notNull(),
  priceSignature: text('price_signature').notNull(),
  checkpointSignature: text('checkpoint_signature').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const navMarkets = sqliteTable('nav_markets', {
  name: text('name').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  baseName: text('base_name').notNull(),
  baseMint: text('base_mint').notNull(),
  navMint: text('nav_mint').notNull(),
  samsaraMarket: text('samsara_market').notNull(),
  mayflowerMarket: text('mayflower_market').notNull(),
  marketMetadata: text('market_metadata').notNull(),
  marketGroup: text('market_group').notNull(),
  marketSolVault: text('market_sol_vault').notNull(),
  marketNavVault: text('market_nav_vault').notNull(),
  feeVault: text('fee_vault').notNull(),
  authorityPda: text('authority_pda').notNull(),
  baseDecimals: integer('base_decimals').notNull(),
  navDecimals: integer('nav_decimals').notNull(),
});
