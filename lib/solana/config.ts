/**
 * Nirvana Protocol Constants
 * Program IDs, PDAs, and Token Mints
 */

// Main program ID
export const NIRVANA_PROGRAM = 'NirvHuZvrm2zSxjkBvSbaF2tHfP5j7cvMj9QmdoHVwb';

// Important accounts
export const TENANT_ACCOUNT = 'BcAoCEdkzV2J21gAjCCEokBw5iMnAe96SbYo9F6QmKWV';
export const PRICE_CURVE = 'Fx5u5BCTwpckbB6jBbs13nDsRabHb5bq2t2hBDszhSbd';
export const NIRVANA_CONFIG = '5iiZo7BKqdzjZ5wC9KznT3DsAx8VmVfp3xCZD97UrTqD';

// Token mints
export const MINTS = {
  ANA: '5DkzT65YJvCsZcot9L6qwkJnsBCPmKHjJz3QU7t7QeRW',
  NIRV: '3eamaYJ7yicyRd3mYz4YeNyNPGVo6zMmKUp5UP25AxRM',
  PRANA: 'CLr7G2af9VSfH1PFZ5fYvB8WK1DTgE85qrVjpa8Xkg4N',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

// RPC request limits
export const MAX_SIGNATURES_PER_REQUEST = 100;
export const MAX_TOKEN_ACCOUNTS_PER_REQUEST = 100;

// Allowed Nirvana instructions
export const ALLOWED_INSTRUCTIONS = [
  'buy_ana',
  'sell_ana',
  'stake_ana',
  'unstake_ana',
  'realize_prana',
  'claim_prana',
  'repay_debt',
] as const;

// Samsara / Mayflower
export const MAYFLOWER_PROGRAM = 'AVMmmRzwc2kETQNhPiFVnyu62HrgsQXTD6D7SnSfEz7v';
export const SAMSARA_PROGRAM = 'SAMmdq34d9RJoqoqfnGhMRUvZumQriaT55eGzXeAQj7';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

export const PRANA_DECIMALS = 6;
