/**
 * Shared Nirvana protocol utilities for reading on-chain data
 */

import { getAccountInfo } from './rpc';
import { PRICE_CURVE } from './config';

/**
 * Decode a Decimal type from on-chain bytes (rust_decimal format)
 */
export function decodeDecimalBytes(bytes: number[]): number {
  const scale = bytes[2];
  if (scale < 1 || scale > 28) return 0.0;

  let rawValue = BigInt(0);
  for (let i = 4; i < 16; i++) {
    rawValue |= BigInt(bytes[i]) << BigInt(8 * (i - 4));
  }

  const divisor = BigInt(10) ** BigInt(scale);
  return Number(rawValue) / Number(divisor);
}

/**
 * Decode a Rust Decimal from a buffer at the given offset (16 bytes)
 */
export function decodeRustDecimal(buffer: Buffer, offset: number): number {
  const bytes = Array.from(buffer.slice(offset, offset + 16));
  return decodeDecimalBytes(bytes);
}

/**
 * Fetch the floor price from the PriceCurve account
 */
export async function fetchFloorPrice(rpcUrl: string): Promise<number> {
  const accountInfo = await getAccountInfo(PRICE_CURVE, rpcUrl);
  if (!accountInfo) {
    throw new Error('PriceCurve account not found');
  }

  const data = accountInfo.data as string;
  const bytes = Buffer.from(data, 'base64');

  // Floor price is at offset 40, 16 bytes
  const floorPriceBytes = Array.from(bytes.slice(40, 56));
  return decodeDecimalBytes(floorPriceBytes);
}
