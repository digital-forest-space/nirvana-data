/**
 * Transaction simulation utilities
 * Provides claimable prANA simulation via stage_prana instruction
 */

import {
  address,
  getAddressEncoder,
  getBase58Encoder,
} from '@solana/kit';
import { NIRVANA_PROGRAM, TENANT_ACCOUNT } from './config';

/**
 * Read a u64 from bytes (little-endian)
 */
function readU64(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(8 * i);
  }
  return value;
}

/**
 * Simulate stage_prana instruction to get claimable prANA amount
 *
 * Builds a legacy transaction from first principles, then calls
 * simulateTransaction RPC to get the post-simulation PersonalAccount
 * state which contains the calculated claimable prANA at offset 120.
 */
export async function simulateClaimablePrana(
  rpcUrl: string,
  userPubkey: string,
  personalAccountAddress: string
): Promise<number> {
  // stage_prana discriminator
  const discriminator = new Uint8Array([54, 112, 82, 14, 216, 131, 165, 126]);

  // Get recent blockhash
  const blockhashResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'confirmed' }],
    }),
  });
  const blockhashData = await blockhashResponse.json() as {
    result: { value: { blockhash: string; lastValidBlockHeight: number } };
  };
  const { blockhash } = blockhashData.result.value;

  try {
    const addressEncoder = getAddressEncoder();
    const base58Encoder = getBase58Encoder();

    const feePayer = address(userPubkey);
    const tenantAddress = address(TENANT_ACCOUNT);
    const personalAddress = address(personalAccountAddress);
    const programId = address(NIRVANA_PROGRAM);

    // Build Legacy Message Format
    const numRequiredSignatures = 1;
    const numReadonlySignedAccounts = 0;
    const numReadonlyUnsignedAccounts = 1;

    const messageBytes: number[] = [];

    // Header (3 bytes)
    messageBytes.push(numRequiredSignatures);
    messageBytes.push(numReadonlySignedAccounts);
    messageBytes.push(numReadonlyUnsignedAccounts);

    // Account keys count - 4 accounts
    messageBytes.push(4);

    // Account keys (32 bytes each)
    messageBytes.push(...addressEncoder.encode(feePayer));
    messageBytes.push(...addressEncoder.encode(tenantAddress));
    messageBytes.push(...addressEncoder.encode(personalAddress));
    messageBytes.push(...addressEncoder.encode(programId));

    // Recent blockhash (32 bytes)
    messageBytes.push(...base58Encoder.encode(blockhash));

    // Instruction count - 1 instruction
    messageBytes.push(1);

    // Program ID at index 3
    messageBytes.push(3);

    // Account indexes: 2 accounts (tenant, personal)
    messageBytes.push(2);
    messageBytes.push(1);
    messageBytes.push(2);

    // Data
    messageBytes.push(discriminator.length);
    messageBytes.push(...discriminator);

    // Build full transaction
    const txBytes: number[] = [];
    txBytes.push(1); // 1 signature
    txBytes.push(...new Array(64).fill(0)); // empty signature
    txBytes.push(...messageBytes);

    const txBase64 = Buffer.from(txBytes).toString('base64');

    // Call simulateTransaction RPC
    const simResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'simulateTransaction',
        params: [
          txBase64,
          {
            encoding: 'base64',
            commitment: 'confirmed',
            sigVerify: false,
            replaceRecentBlockhash: true,
            accounts: {
              encoding: 'base64',
              addresses: [personalAccountAddress],
            },
          },
        ],
      }),
    });

    const simData = await simResponse.json() as {
      result?: {
        value: {
          err: unknown;
          accounts: Array<{ data: [string, string] } | null>;
          logs?: string[];
        };
      };
      error?: { code: number; message: string };
    };

    if (simData.error) {
      console.error('Simulation RPC error:', simData.error);
      return 0;
    }

    const simValue = simData.result?.value;
    if (!simValue || simValue.err) return 0;

    const accounts = simValue.accounts;
    if (!accounts || accounts.length === 0 || !accounts[0]) return 0;

    const postData = Buffer.from(accounts[0].data[0], 'base64');
    if (postData.length < 128) return 0;

    // Read claimable prANA from offset 120
    const claimableRaw = readU64(postData, 120);
    return Number(claimableRaw) / 1000000;

  } catch (error) {
    console.error('Simulation exception:', error);
    return 0;
  }
}
