/**
 * Samsara / Mayflower constants and helpers
 * Shared utilities for navMarket discovery and balance fetching
 */

import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import { rpcCall } from './rpc';
import { TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM } from './config';

/**
 * Read a u64 from bytes (little-endian)
 */
export function readU64(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(8 * i);
  }
  return value;
}

/**
 * Derive a PDA given a program ID and seeds
 */
export async function findPda(
  programId: string,
  seeds: (string | Uint8Array)[]
): Promise<string> {
  const encoder = getAddressEncoder();
  const textEncoder = new TextEncoder();

  const encodedSeeds: Uint8Array[] = seeds.map((seed) => {
    if (typeof seed === 'string') {
      // If it looks like a base58 pubkey (32-44 chars, base58 charset), encode as address
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(seed)) {
        return new Uint8Array(encoder.encode(address(seed)));
      }
      // Otherwise treat as UTF-8 string seed
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

/**
 * Derive an Associated Token Account address
 */
export async function findAta(owner: string, mint: string): Promise<string> {
  const encoder = getAddressEncoder();
  const ownerBytes = new Uint8Array(encoder.encode(address(owner)));
  const tokenProgramBytes = new Uint8Array(encoder.encode(address(TOKEN_PROGRAM)));
  const mintBytes = new Uint8Array(encoder.encode(address(mint)));

  const [ataAddress] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
    seeds: [ownerBytes, tokenProgramBytes, mintBytes],
  });

  return ataAddress as string;
}

interface MultipleAccountsResult {
  value: Array<{
    data: [string, string];
    lamports: number;
    owner: string;
  } | null>;
}

/**
 * Batch getMultipleAccounts RPC call
 * Returns array of account data (base64) or null for each address
 */
export async function getMultipleAccounts(
  addresses: string[],
  rpcUrl: string
): Promise<Array<{ data: Buffer; lamports: number } | null>> {
  if (addresses.length === 0) return [];

  const BATCH_SIZE = 100;
  const results: Array<{ data: Buffer; lamports: number } | null> = [];

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const result = await rpcCall<MultipleAccountsResult>(
      'getMultipleAccounts',
      [batch, { encoding: 'base64' }],
      rpcUrl
    );

    for (const account of result.value) {
      if (!account) {
        results.push(null);
      } else {
        results.push({
          data: Buffer.from(account.data[0], 'base64'),
          lamports: account.lamports,
        });
      }
    }
  }

  return results;
}

/**
 * Parse SPL token account balance from raw account data
 * SPL token amount is a u64 at offset 64
 */
export function parseTokenAccountAmount(data: Buffer, decimals: number): number {
  if (data.length < 72) return 0;
  const raw = readU64(data, 64);
  return Number(raw) / Math.pow(10, decimals);
}
