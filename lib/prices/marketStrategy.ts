/**
 * Market price strategy interface and implementations
 *
 * Abstracts the difference between ANA and nav market price parsing
 * so the shared paging engine can work with any market type.
 */

import { getTransaction, getAccountInfo } from '@/lib/solana/rpc';
import { NIRVANA_PROGRAM, TENANT_ACCOUNT, MINTS } from '@/lib/solana/config';
import { fetchFloorPrice, decodeRustDecimal } from '@/lib/solana/nirvana';
import type { NavMarketInfo } from '@/lib/markets';

export interface MarketPriceStrategy {
  marketName: string;
  signatureAddress: string;
  currency: string;

  parseTransactionPrice(
    signature: string,
    rpcUrl: string
  ): Promise<{ price: number; fee?: number; currency?: string; found: boolean }>;

  fetchFloorPrice(rpcUrl: string): Promise<number>;

  validatePrice(price: number, floor: number): boolean;
}

// --- ANA Strategy ---

const ANA_MINT = MINTS.ANA;
const NIRV_MINT = MINTS.NIRV;
const USDC_MINT = MINTS.USDC;
const PRANA_MINT = MINTS.PRANA;

function extractBalanceChanges(
  preBalances: Array<{ accountIndex: number; mint: string; uiTokenAmount: { uiAmountString: string }; owner?: string }>,
  postBalances: Array<{ accountIndex: number; mint: string; uiTokenAmount: { uiAmountString: string }; owner?: string }>
): Array<{ mint: string; change: number; owner: string }> {
  const changes: Array<{ mint: string; change: number; owner: string }> = [];
  const processedIndices = new Set<number>();

  for (const preBalance of preBalances) {
    const { accountIndex, mint } = preBalance;
    processedIndices.add(accountIndex);

    const postBalance = postBalances.find((pb) => pb.accountIndex === accountIndex);
    if (!postBalance) continue;

    const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmountString || '0');
    const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');
    const change = postAmount - preAmount;

    if (Math.abs(change) < 0.000001) continue;

    changes.push({
      mint,
      change,
      owner: preBalance.owner || 'unknown',
    });
  }

  for (const postBalance of postBalances) {
    if (processedIndices.has(postBalance.accountIndex)) continue;

    const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');
    if (Math.abs(postAmount) < 0.000001) continue;

    changes.push({
      mint: postBalance.mint,
      change: postAmount,
      owner: postBalance.owner || 'unknown',
    });
    processedIndices.add(postBalance.accountIndex);
  }

  return changes;
}

function getChangeForMint(
  changes: Array<{ mint: string; change: number; owner: string }>,
  mint: string
): number {
  const match = changes.find((c) => c.mint === mint);
  return match?.change ?? 0;
}

function parseBurnMintOperations(
  instructions: Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }>,
  innerInstructions: Array<{ instructions?: Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> }>
): Map<string, number> {
  const changes = new Map<string, number>();

  const processInstruction = (instruction: { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }) => {
    if (instruction.program !== 'spl-token') return;

    const parsed = instruction.parsed;
    if (!parsed) return;

    const { type, info } = parsed;
    if (!info) return;

    if (type === 'burn') {
      const mint = info['mint'] as string;
      const amount = info['amount'] as string;
      if (mint && amount) {
        const uiAmount = parseInt(amount, 10) / 1000000.0;
        changes.set(mint, (changes.get(mint) || 0) - uiAmount);
      }
    } else if (type === 'mint' || type === 'mintTo') {
      const mint = info['mint'] as string;
      const amount = info['amount'] as string;
      if (mint && amount) {
        const uiAmount = parseInt(amount, 10) / 1000000.0;
        changes.set(mint, (changes.get(mint) || 0) + uiAmount);
      }
    }
  };

  for (const instruction of instructions) {
    processInstruction(instruction);
  }

  for (const inner of innerInstructions) {
    for (const instruction of inner.instructions || []) {
      processInstruction(instruction);
    }
  }

  return changes;
}

function parseFeeTransfers(
  instructions: Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }>,
  innerInstructions: Array<{ instructions?: Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> }>
): { fee: number; currency: string } | null {
  const feeAccounts = new Set([
    '42rJYSmYHqbn5mk992xAoKZnWEiuMzr6u6ydj9m8fAjP',
    'v2EeX2VjgsMbwokj6UDmAm691oePzrcvKpK5DT7LwbQ',
  ]);

  let fee = 0;
  let currency = '';

  const processInstruction = (instruction: { program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }) => {
    if (instruction.program !== 'spl-token') return;

    const parsed = instruction.parsed;
    if (!parsed) return;

    const { type, info } = parsed;
    if (!info) return;

    if (type === 'mintTo') {
      const account = info['account'] as string;
      const mint = info['mint'] as string;
      const amount = info['amount'] as string;

      if (feeAccounts.has(account) && mint && amount) {
        const uiAmount = parseInt(amount, 10) / 1000000.0;
        fee += uiAmount;
        if (mint === ANA_MINT) currency = 'ANA';
        else if (mint === NIRV_MINT) currency = 'NIRV';
        else if (mint === USDC_MINT) currency = 'USDC';
      }
    }

    if (type === 'transfer' || type === 'transferChecked') {
      const destination = info['destination'] as string;
      const mint = info['mint'] as string;

      if (feeAccounts.has(destination)) {
        let uiAmount: number | undefined;
        if (type === 'transferChecked') {
          const tokenAmount = info['tokenAmount'] as { uiAmount?: number } | undefined;
          uiAmount = tokenAmount?.uiAmount;
        } else {
          const amount = info['amount'] as string;
          if (amount) {
            uiAmount = parseInt(amount, 10) / 1000000.0;
          }
        }

        if (uiAmount !== undefined) {
          fee += uiAmount;
          if (mint === ANA_MINT) currency = 'ANA';
          else if (mint === NIRV_MINT) currency = 'NIRV';
          else if (mint === USDC_MINT) currency = 'USDC';
        }
      }
    }
  };

  for (const instruction of instructions) {
    processInstruction(instruction);
  }

  for (const inner of innerInstructions) {
    for (const instruction of inner.instructions || []) {
      processInstruction(instruction);
    }
  }

  return fee > 0 ? { fee, currency } : null;
}

async function parseAnaTransactionPrice(
  signature: string,
  rpcUrl: string
): Promise<{ price: number; fee?: number; currency?: string; found: boolean }> {
  const txData = await getTransaction(signature, rpcUrl);
  if (!txData) return { price: 0, found: false };

  const meta = txData.meta;
  if (!meta || meta.err) return { price: 0, found: false };

  const message = txData.transaction.message;
  const preTokenBalances = (meta as Record<string, unknown>)['preTokenBalances'] as Array<{ accountIndex: number; mint: string; uiTokenAmount: { uiAmountString: string }; owner?: string }> || [];
  const postTokenBalances = (meta as Record<string, unknown>)['postTokenBalances'] as Array<{ accountIndex: number; mint: string; uiTokenAmount: { uiAmountString: string }; owner?: string }> || [];

  const allChanges = extractBalanceChanges(preTokenBalances, postTokenBalances);
  const userChanges = allChanges.filter((c) => c.owner !== TENANT_ACCOUNT);

  const pranaChange = getChangeForMint(userChanges, PRANA_MINT);
  if (pranaChange !== 0) return { price: 0, found: false };

  const anaUserChange = getChangeForMint(userChanges, ANA_MINT);
  const nirvUserChange = getChangeForMint(userChanges, NIRV_MINT);
  const usdcUserChange = getChangeForMint(userChanges, USDC_MINT);

  const instructions = (message as Record<string, unknown>)['instructions'] as Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> || [];
  const innerInstructions = (meta as Record<string, unknown>)['innerInstructions'] as Array<{ instructions?: Array<{ program?: string; parsed?: { type?: string; info?: Record<string, unknown> } }> }> || [];
  const burnMintChanges = parseBurnMintOperations(instructions, innerInstructions);

  const anaBurnMint = burnMintChanges.get(ANA_MINT) || 0;
  const nirvBurnMint = burnMintChanges.get(NIRV_MINT) || 0;

  const anaChange = anaBurnMint !== 0 ? anaBurnMint : anaUserChange;

  if (anaChange === 0) return { price: 0, found: false };

  const feeInfo = parseFeeTransfers(instructions, innerInstructions);

  let pricePerAna: number;
  let paymentAmount: number;
  let currency: string;

  if (anaChange > 0) {
    const anaAmount = anaChange;
    if (nirvUserChange < 0 || nirvBurnMint < 0) {
      paymentAmount = nirvBurnMint !== 0 ? Math.abs(nirvBurnMint) : Math.abs(nirvUserChange);
      currency = 'NIRV';
    } else if (usdcUserChange < 0) {
      paymentAmount = Math.abs(usdcUserChange);
      currency = 'USDC';
    } else {
      return { price: 0, found: false };
    }
    pricePerAna = paymentAmount / anaAmount;
  } else {
    const anaAmount = Math.abs(anaChange);
    if (nirvUserChange > 0 || nirvBurnMint > 0) {
      paymentAmount = nirvBurnMint !== 0 ? nirvBurnMint : nirvUserChange;
      currency = 'NIRV';
    } else if (usdcUserChange > 0) {
      paymentAmount = usdcUserChange;
      currency = 'USDC';
    } else {
      return { price: 0, found: false };
    }
    pricePerAna = paymentAmount / anaAmount;
  }

  return {
    price: pricePerAna,
    fee: feeInfo?.fee,
    currency: feeInfo?.currency || currency,
    found: true,
  };
}

export function createAnaStrategy(): MarketPriceStrategy {
  return {
    marketName: 'ANA',
    signatureAddress: NIRVANA_PROGRAM,
    currency: 'NIRV',
    parseTransactionPrice: parseAnaTransactionPrice,
    fetchFloorPrice: (rpcUrl: string) => fetchFloorPrice(rpcUrl),
    validatePrice: (price: number, floor: number) => price >= floor,
  };
}

// --- Nav Market Strategy ---

type TokenBalanceEntry = {
  accountIndex: number;
  mint: string;
  uiTokenAmount: { uiAmountString: string };
  owner?: string;
};

function sumBalanceChangesForMint(
  preBalances: TokenBalanceEntry[],
  postBalances: TokenBalanceEntry[],
  mint: string,
  ownerFilter?: string
): number {
  let total = 0;
  const processedIndices = new Set<number>();

  for (const pre of preBalances) {
    if (pre.mint !== mint) continue;
    if (ownerFilter && pre.owner !== ownerFilter) continue;

    processedIndices.add(pre.accountIndex);

    const post = postBalances.find((p) => p.accountIndex === pre.accountIndex);
    if (!post) continue;

    const preAmount = parseFloat(pre.uiTokenAmount.uiAmountString || '0');
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    total += postAmount - preAmount;
  }

  for (const post of postBalances) {
    if (post.mint !== mint) continue;
    if (ownerFilter && post.owner !== ownerFilter) continue;
    if (processedIndices.has(post.accountIndex)) continue;

    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    total += postAmount;
  }

  return total;
}

async function parseNavMarketTransactionPrice(
  market: NavMarketInfo,
  signature: string,
  rpcUrl: string
): Promise<{ price: number; fee?: number; currency?: string; found: boolean }> {
  const txData = await getTransaction(signature, rpcUrl);
  if (!txData) return { price: 0, found: false };

  const meta = txData.meta;
  if (!meta || meta.err) return { price: 0, found: false };

  const preTokenBalances = (meta as Record<string, unknown>)['preTokenBalances'] as TokenBalanceEntry[] || [];
  const postTokenBalances = (meta as Record<string, unknown>)['postTokenBalances'] as TokenBalanceEntry[] || [];

  const navChange = sumBalanceChangesForMint(preTokenBalances, postTokenBalances, market.navMint);
  const baseChange = sumBalanceChangesForMint(preTokenBalances, postTokenBalances, market.baseMint, market.marketMetadata);

  if (Math.abs(navChange) < 0.000001 || Math.abs(baseChange) < 0.000001) {
    return { price: 0, found: false };
  }

  const price = Math.abs(baseChange) / Math.abs(navChange);

  return {
    price,
    currency: market.baseName,
    found: true,
  };
}

async function fetchNavMarketFloorPrice(market: NavMarketInfo, rpcUrl: string): Promise<number> {
  const accountInfo = await getAccountInfo(market.mayflowerMarket, rpcUrl);
  if (!accountInfo) {
    throw new Error(`Mayflower market account not found: ${market.mayflowerMarket}`);
  }

  const data = accountInfo.data as string;
  const bytes = Buffer.from(data, 'base64');

  // Floor price at offset 104, 16 bytes (Rust Decimal)
  return decodeRustDecimal(bytes, 104);
}

export function createNavMarketStrategy(market: NavMarketInfo): MarketPriceStrategy {
  return {
    marketName: market.name,
    signatureAddress: market.mayflowerMarket,
    currency: market.baseName,
    parseTransactionPrice: (signature: string, rpcUrl: string) =>
      parseNavMarketTransactionPrice(market, signature, rpcUrl),
    fetchFloorPrice: (rpcUrl: string) => fetchNavMarketFloorPrice(market, rpcUrl),
    validatePrice: () => true,
  };
}
