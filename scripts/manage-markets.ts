#!/usr/bin/env npx tsx
/**
 * TUI for managing nav markets in Turso
 * Discovers markets on-chain and lets you upsert them into the DB.
 *
 * Usage: npm run markets
 */

import { createInterface } from 'readline';
import { config } from 'dotenv';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { navMarkets } from '../lib/db/schema';
import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import bs58 from 'bs58';

// Load .env.local
config({ path: '.env.local' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ── Constants ──

const MAYFLOWER_PROGRAM = 'AVMmmRzwc2kETQNhPiFVnyu62HrgsQXTD6D7SnSfEz7v';
const SAMSARA_PROGRAM = 'SAMmdq34d9RJoqoqfnGhMRUvZumQriaT55eGzXeAQj7';

const WELL_KNOWN_MINTS: Record<string, { name: string; symbol: string }> = {
  'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', symbol: 'SOL' },
  'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS': { name: 'Zcash', symbol: 'ZEC' },
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij': { name: 'Coinbase Wrapped BTC', symbol: 'cbBTC' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { name: 'Wrapped Ether', symbol: 'WETH' },
  'navSnrYJkCxMiyhM3F7K889X1u8JFLVHHLxiyo6Jjqo': { name: 'navSOL', symbol: 'navSOL' },
  'navZyeDnqgHBJQjHX8Kk7ZEzwFgDXxVJBcsAXd76gVe': { name: 'navZEC', symbol: 'navZEC' },
  'navB4nQ2ENP18CCo1Jqw9bbLncLBC389Rf3XRCQ6zau': { name: 'navCBBTC', symbol: 'navCBBTC' },
  'navEgA7saxpNqKcnJcWbCeCFMhSQtN8hQWQkK4h9scH': { name: 'navETH', symbol: 'navETH' },
};

// ── RPC helpers ──

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = process.env.SOLANA_RPC_URL!;
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await response.json() as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result!;
}

function bytesToBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

function parseMintDecimals(account: { data: [string, string] } | null): number {
  if (!account) return 9;
  const bytes = Buffer.from(account.data[0], 'base64');
  if (bytes.length < 45) return 9;
  return bytes[44];
}

// ── PDA derivation ──

async function derivePda(programId: string, seeds: (string | Uint8Array)[]): Promise<string> {
  const encoder = getAddressEncoder();
  const textEncoder = new TextEncoder();

  const encodedSeeds: Uint8Array[] = seeds.map((seed) => {
    if (typeof seed === 'string') {
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(seed)) {
        return new Uint8Array(encoder.encode(address(seed)));
      }
      return textEncoder.encode(seed);
    }
    return seed;
  });

  const [pdaAddress] = await getProgramDerivedAddress({
    programAddress: address(programId),
    seeds: encodedSeeds,
  });

  return pdaAddress as string;
}

// ── On-chain market type ──

interface DiscoveredMarket {
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

// ── Discover markets on-chain ──

async function discoverMarkets(): Promise<DiscoveredMarket[]> {
  console.log('\n  Discovering markets on-chain...');

  // 1. Fetch all MarketLinear accounts (304 bytes) from Mayflower
  console.log('  Fetching MarketLinear accounts...');
  interface ProgramAccount {
    pubkey: string;
    account: { data: [string, string] };
  }
  const marketLinearAccounts = await rpcCall<ProgramAccount[]>(
    'getProgramAccounts',
    [MAYFLOWER_PROGRAM, { encoding: 'base64', filters: [{ dataSize: 304 }] }]
  );

  if (marketLinearAccounts.length === 0) {
    console.log('  No MarketLinear accounts found.');
    return [];
  }
  console.log(`  Found ${marketLinearAccounts.length} MarketLinear accounts.`);

  // Extract marketMetadata pubkey (offset 8-40) from each
  const metadataAddresses: string[] = [];
  const mayflowerMarketPubkeys: string[] = [];

  for (const account of marketLinearAccounts) {
    const bytes = Buffer.from(account.account.data[0], 'base64');
    if (bytes.length < 40) continue;
    metadataAddresses.push(bytesToBase58(bytes.subarray(8, 40)));
    mayflowerMarketPubkeys.push(account.pubkey);
  }

  // 2. Batch-fetch MarketMeta accounts
  console.log('  Fetching MarketMeta accounts...');
  interface AccountResult {
    data: [string, string];
    lamports: number;
  }
  const metaResult = await rpcCall<{ value: (AccountResult | null)[] }>(
    'getMultipleAccounts',
    [metadataAddresses, { encoding: 'base64' }]
  );

  // Parse MarketMeta fields and collect unique mints
  const mintSet = new Set<string>();
  interface ParsedMeta {
    mayflowerMarket: string;
    marketMetadata: string;
    baseMint: string;
    navMint: string;
    marketGroup: string;
    baseVault: string;
    navVault: string;
    feeVault: string;
  }
  const parsedMetas: ParsedMeta[] = [];

  for (let i = 0; i < metaResult.value.length; i++) {
    const metaAccount = metaResult.value[i];
    if (!metaAccount) continue;

    const bytes = Buffer.from(metaAccount.data[0], 'base64');
    if (bytes.length < 296) continue;

    const baseMint = bytesToBase58(bytes.subarray(8, 40));
    const navMint = bytesToBase58(bytes.subarray(40, 72));
    const marketGroup = bytesToBase58(bytes.subarray(104, 136));
    const baseVault = bytesToBase58(bytes.subarray(200, 232));
    const navVault = bytesToBase58(bytes.subarray(232, 264));
    const feeVault = bytesToBase58(bytes.subarray(264, 296));

    mintSet.add(baseMint);
    mintSet.add(navMint);

    parsedMetas.push({
      mayflowerMarket: mayflowerMarketPubkeys[i],
      marketMetadata: metadataAddresses[i],
      baseMint,
      navMint,
      marketGroup,
      baseVault,
      navVault,
      feeVault,
    });
  }

  // 3. Batch-fetch SPL Mint accounts for decimals
  console.log('  Fetching mint decimals...');
  const mintList = [...mintSet];
  const mintResult = await rpcCall<{ value: (AccountResult | null)[] }>(
    'getMultipleAccounts',
    [mintList, { encoding: 'base64' }]
  );
  const mintDecimals = new Map<string, number>();
  for (let i = 0; i < mintList.length; i++) {
    const account = mintResult.value[i];
    mintDecimals.set(mintList[i], parseMintDecimals(account ? { data: account.data } : null));
  }

  // 4. Derive PDAs and build market objects
  console.log('  Deriving PDAs...');
  const markets: DiscoveredMarket[] = [];

  for (const meta of parsedMetas) {
    // Samsara market PDA: seeds ["market", marketMeta]
    const samsaraMarket = await derivePda(SAMSARA_PROGRAM, ['market', meta.marketMetadata]);
    // Authority PDA: seeds ["liq_vault_main", marketMeta]
    const authorityPda = await derivePda(MAYFLOWER_PROGRAM, ['liq_vault_main', meta.marketMetadata]);

    // Resolve names
    const navInfo = WELL_KNOWN_MINTS[meta.navMint];
    const baseInfo = WELL_KNOWN_MINTS[meta.baseMint];
    const name = navInfo?.symbol ?? `nav_${meta.navMint.substring(0, 8)}`;
    const baseName = baseInfo?.symbol ?? meta.baseMint.substring(0, 8);

    markets.push({
      name,
      baseName,
      baseMint: meta.baseMint,
      navMint: meta.navMint,
      samsaraMarket,
      mayflowerMarket: meta.mayflowerMarket,
      marketMetadata: meta.marketMetadata,
      marketGroup: meta.marketGroup,
      marketSolVault: meta.baseVault,
      marketNavVault: meta.navVault,
      feeVault: meta.feeVault,
      authorityPda,
      baseDecimals: mintDecimals.get(meta.baseMint) ?? 9,
      navDecimals: mintDecimals.get(meta.navMint) ?? 9,
    });
  }

  return markets;
}

// ── List & select ──

async function listAndUpsert() {
  const discovered = await discoverMarkets();
  if (discovered.length === 0) return;

  // Load existing DB markets for comparison
  const dbRows = await db.select().from(navMarkets);
  const dbSet = new Set(dbRows.map((r) => r.name));

  console.log(`\n  Found ${discovered.length} on-chain markets:\n`);
  for (let i = 0; i < discovered.length; i++) {
    const m = discovered[i];
    const inDb = dbSet.has(m.name);
    const tag = inDb ? '\x1b[32m[in DB]\x1b[0m' : '\x1b[33m[new]  \x1b[0m';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${tag} ${m.name.padEnd(12)} base=${m.baseName}  decimals=${m.baseDecimals}/${m.navDecimals}`);
  }

  console.log('\n  Enter numbers to upsert (comma-separated, "all", or "q" to cancel)');
  const choice = await ask('  > ');

  if (choice.trim().toLowerCase() === 'q') { console.log('  Cancelled.\n'); return; }

  let indices: number[];
  if (choice.trim().toLowerCase() === 'all') {
    indices = discovered.map((_, i) => i);
  } else {
    indices = choice.split(',')
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((i) => !isNaN(i) && i >= 0 && i < discovered.length);
  }

  if (indices.length === 0) { console.log('  No valid selections.\n'); return; }

  for (const idx of indices) {
    const m = discovered[idx];
    await db.insert(navMarkets).values({
      name: m.name,
      enabled: true,
      baseName: m.baseName,
      baseMint: m.baseMint,
      navMint: m.navMint,
      samsaraMarket: m.samsaraMarket,
      mayflowerMarket: m.mayflowerMarket,
      marketMetadata: m.marketMetadata,
      marketGroup: m.marketGroup,
      marketSolVault: m.marketSolVault,
      marketNavVault: m.marketNavVault,
      feeVault: m.feeVault,
      authorityPda: m.authorityPda,
      baseDecimals: m.baseDecimals,
      navDecimals: m.navDecimals,
    }).onConflictDoUpdate({
      target: navMarkets.name,
      set: {
        baseName: m.baseName,
        baseMint: m.baseMint,
        navMint: m.navMint,
        samsaraMarket: m.samsaraMarket,
        mayflowerMarket: m.mayflowerMarket,
        marketMetadata: m.marketMetadata,
        marketGroup: m.marketGroup,
        marketSolVault: m.marketSolVault,
        marketNavVault: m.marketNavVault,
        feeVault: m.feeVault,
        authorityPda: m.authorityPda,
        baseDecimals: m.baseDecimals,
        navDecimals: m.navDecimals,
      },
    });
    console.log(`  Upserted ${m.name}`);
  }
  console.log('');
}

// ── DB listing ──

async function listDbMarkets() {
  const rows = await db.select().from(navMarkets);
  if (rows.length === 0) {
    console.log('\n  No markets in DB.\n');
    return;
  }
  console.log('');
  for (const m of rows) {
    const status = m.enabled ? '\x1b[32mON \x1b[0m' : '\x1b[31mOFF\x1b[0m';
    console.log(`  ${status}  ${m.name.padEnd(12)} base=${m.baseName}  decimals=${m.baseDecimals}/${m.navDecimals}`);
  }
  console.log('');
}

// ── Toggle ──

async function toggleMarket() {
  const rows = await db.select().from(navMarkets);
  if (rows.length === 0) { console.log('\n  No markets to toggle.\n'); return; }

  console.log('');
  rows.forEach((m, i) => {
    const status = m.enabled ? 'ON ' : 'OFF';
    console.log(`  ${i + 1}. [${status}] ${m.name}`);
  });

  const choice = await ask('\n  Toggle which? (number): ');
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= rows.length) { console.log('  Cancelled.'); return; }

  const market = rows[idx];
  await db.update(navMarkets)
    .set({ enabled: !market.enabled })
    .where(eq(navMarkets.name, market.name));

  console.log(`\n  ${market.name} is now ${market.enabled ? 'OFF' : 'ON'}\n`);
}

// ── Inspect ──

async function inspectMarket() {
  const rows = await db.select().from(navMarkets);
  if (rows.length === 0) { console.log('\n  No markets.\n'); return; }

  console.log('');
  rows.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));

  const choice = await ask('\n  Inspect which? (number): ');
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= rows.length) { console.log('  Cancelled.'); return; }

  const m = rows[idx];
  console.log(`
  ${m.name} ${m.enabled ? '(enabled)' : '(disabled)'}
  ─────────────────────────────────
  baseName:        ${m.baseName}
  baseMint:        ${m.baseMint}
  navMint:         ${m.navMint}
  samsaraMarket:   ${m.samsaraMarket}
  mayflowerMarket: ${m.mayflowerMarket}
  marketMetadata:  ${m.marketMetadata}
  marketGroup:     ${m.marketGroup}
  marketSolVault:  ${m.marketSolVault}
  marketNavVault:  ${m.marketNavVault}
  feeVault:        ${m.feeVault}
  authorityPda:    ${m.authorityPda}
  baseDecimals:    ${m.baseDecimals}
  navDecimals:     ${m.navDecimals}
`);
}

// ── Delete ──

async function deleteMarket() {
  const rows = await db.select().from(navMarkets);
  if (rows.length === 0) { console.log('\n  No markets to delete.\n'); return; }

  console.log('');
  rows.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));

  const choice = await ask('\n  Delete which? (number): ');
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= rows.length) { console.log('  Cancelled.'); return; }

  const market = rows[idx];
  const confirm = await ask(`  Delete ${market.name}? (y/N): `);
  if (confirm.toLowerCase() !== 'y') { console.log('  Cancelled.'); return; }

  await db.delete(navMarkets).where(eq(navMarkets.name, market.name));
  console.log(`\n  Deleted ${market.name}\n`);
}

// ── Main loop ──

async function main() {
  console.log('\n  ╔══════════════════════════╗');
  console.log('  ║   Nav Market Manager     ║');
  console.log('  ╚══════════════════════════╝');

  while (true) {
    console.log('  1. Discover on-chain markets & upsert');
    console.log('  2. List DB markets');
    console.log('  3. Toggle enabled/disabled');
    console.log('  4. Inspect market');
    console.log('  5. Delete market');
    console.log('  q. Quit');

    const choice = await ask('\n  > ');

    switch (choice.trim()) {
      case '1': await listAndUpsert(); break;
      case '2': await listDbMarkets(); break;
      case '3': await toggleMarket(); break;
      case '4': await inspectMarket(); break;
      case '5': await deleteMarket(); break;
      case 'q': case 'Q':
        console.log('  Bye!\n');
        rl.close();
        process.exit(0);
      default:
        console.log('  Invalid choice.\n');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
