/**
 * Personal account discovery and parsing
 * Shared between balances, staking, and claimable endpoints
 */

import { rpcCall, getAccountInfo } from './rpc';
import { NIRVANA_PROGRAM } from './config';

// Public RPC for getProgramAccounts (many paid RPCs don't support this method)
const PUBLIC_RPC_URL = 'https://api.mainnet-beta.solana.com';

function readU64(bytes: Buffer, offset: number): number {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(8 * i);
  }
  return Number(value);
}

export interface PersonalAccountData {
  address: string;
  stakedAna: number;
  stakedPrana: number;
  debt: number;
  claimablePrana: number;
  stagedClaimableAna: number;
  stagedClaimableNirv: number;
}

/**
 * Find personal account PDA for a wallet
 * Uses public RPC because getProgramAccounts is often restricted on paid RPCs
 */
export async function findPersonalAccount(userPubkey: string): Promise<string | null> {
  interface ProgramAccount {
    pubkey: string;
    account: {
      data: [string, string];
      owner: string;
    };
  }

  const result = await rpcCall<ProgramAccount[]>(
    'getProgramAccounts',
    [
      NIRVANA_PROGRAM,
      {
        encoding: 'base64',
        filters: [
          { dataSize: 272 },
          { memcmp: { offset: 8, bytes: userPubkey } },
        ],
      },
    ],
    PUBLIC_RPC_URL
  );

  if (result && result.length > 0) {
    return result[0].pubkey;
  }

  return null;
}

/**
 * Parse PersonalAccount data (272 bytes)
 *
 * Layout:
 * - 8 bytes: discriminator (0-7)
 * - 32 bytes: user pubkey (8-39)
 * - 32 bytes: tenant (40-71)
 * - 8 bytes: ana_debt @ offset 72
 * - 8 bytes: staked_ana @ offset 80
 * - 32 bytes: fields 4-7 (88-119)
 * - 8 bytes: claimable_prana @ offset 120
 * - 56 bytes: fields 9-15 (128-183)
 * - 8 bytes: staked_prana @ offset 184
 * - 32 bytes: fields 17-20 (192-223)
 * - 8 bytes: staged_claimable_ana @ offset 224
 * - 32 bytes: fields 22-25 (232-263)
 * - 8 bytes: staged_claimable_nirv @ offset 264
 */
function parsePersonalAccountData(data: Buffer): Omit<PersonalAccountData, 'address'> {
  return {
    stakedAna: readU64(data, 80) / 1000000,
    stakedPrana: readU64(data, 184) / 1000000,
    debt: readU64(data, 72) / 1000000,
    claimablePrana: readU64(data, 120) / 1000000,
    stagedClaimableAna: readU64(data, 224) / 1000000,
    stagedClaimableNirv: readU64(data, 264) / 1000000,
  };
}

/**
 * Fetch full personal account data for a wallet
 */
export async function fetchPersonalAccount(
  wallet: string,
  rpcUrl: string
): Promise<PersonalAccountData | null> {
  const accountAddress = await findPersonalAccount(wallet);
  if (!accountAddress) return null;

  const accountInfo = await getAccountInfo(accountAddress, rpcUrl);
  if (!accountInfo) return null;

  const data = Buffer.from(accountInfo.data as string, 'base64');
  return {
    address: accountAddress,
    ...parsePersonalAccountData(data),
  };
}
