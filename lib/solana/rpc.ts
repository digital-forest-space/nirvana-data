/**
 * Solana RPC Helper
 * Wrapper for making authenticated RPC calls to Solana
 */

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

interface RpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export function getRpcUrl(): string {
  const url = process.env.SOLANA_RPC_URL;
  if (!url) throw new Error('SOLANA_RPC_URL not set');
  return url;
}

/**
 * Make an RPC call to the Solana network
 */
export async function rpcCall<T>(
  method: string,
  params: unknown[],
  rpcUrl: string
): Promise<T> {
  const request: RpcRequest = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as RpcResponse<T>;

  if (data.error) {
    throw new Error(`RPC error: ${data.error.code} - ${data.error.message}`);
  }

  if (data.result === undefined) {
    throw new Error('RPC response missing result');
  }

  return data.result;
}

/**
 * Get account info for a public key
 */
export async function getAccountInfo(
  pubkey: string,
  rpcUrl: string,
  encoding: 'base64' | 'jsonParsed' = 'base64'
): Promise<{ data: string | object; lamports: number; owner: string } | null> {
  interface AccountInfo {
    value: {
      data: string | [string, string] | object;
      lamports: number;
      owner: string;
    } | null;
  }

  const result = await rpcCall<AccountInfo>(
    'getAccountInfo',
    [pubkey, { encoding }],
    rpcUrl
  );

  if (!result.value) return null;

  return {
    data: Array.isArray(result.value.data) ? result.value.data[0] : result.value.data,
    lamports: result.value.lamports,
    owner: result.value.owner,
  };
}

/**
 * Get token accounts by owner
 */
export async function getTokenAccountsByOwner(
  owner: string,
  mint: string,
  rpcUrl: string
): Promise<Array<{ pubkey: string; amount: string; decimals: number }>> {
  interface TokenAccount {
    pubkey: string;
    account: {
      data: {
        parsed: {
          info: {
            tokenAmount: {
              amount: string;
              decimals: number;
            };
          };
        };
      };
    };
  }

  interface TokenAccountsResult {
    value: TokenAccount[];
  }

  const result = await rpcCall<TokenAccountsResult>(
    'getTokenAccountsByOwner',
    [owner, { mint }, { encoding: 'jsonParsed' }],
    rpcUrl
  );

  return result.value.map((account) => ({
    pubkey: account.pubkey,
    amount: account.account.data.parsed.info.tokenAmount.amount,
    decimals: account.account.data.parsed.info.tokenAmount.decimals,
  }));
}

/**
 * Get signatures for address (for transaction history)
 */
export async function getSignaturesForAddress(
  address: string,
  rpcUrl: string,
  options: { limit?: number; before?: string; until?: string } = {}
): Promise<Array<{ signature: string; slot: number; blockTime: number | null }>> {
  interface SignatureInfo {
    signature: string;
    slot: number;
    blockTime: number | null;
    err: object | null;
  }

  const result = await rpcCall<SignatureInfo[]>(
    'getSignaturesForAddress',
    [address, { limit: options.limit ?? 100, ...options }],
    rpcUrl
  );

  return result.map((sig) => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime,
  }));
}

/**
 * Get transaction details
 */
export async function getTransaction(
  signature: string,
  rpcUrl: string
): Promise<{
  slot: number;
  blockTime: number | null;
  meta: { err: object | null; preBalances: number[]; postBalances: number[] } | null;
  transaction: { message: { accountKeys: string[]; instructions: object[] } };
} | null> {
  interface TransactionResult {
    slot: number;
    blockTime: number | null;
    meta: {
      err: object | null;
      preBalances: number[];
      postBalances: number[];
    } | null;
    transaction: {
      message: {
        accountKeys: string[];
        instructions: Array<{
          programIdIndex: number;
          accounts: number[];
          data: string;
        }>;
      };
    };
  }

  const result = await rpcCall<TransactionResult | null>(
    'getTransaction',
    [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    rpcUrl
  );

  return result;
}

/**
 * Send a signed transaction
 */
export async function sendTransaction(
  signedTx: string,
  rpcUrl: string
): Promise<string> {
  return rpcCall<string>(
    'sendTransaction',
    [signedTx, { encoding: 'base64', skipPreflight: false }],
    rpcUrl
  );
}

/**
 * Validate a base58 public key
 */
export function isValidPublicKey(key: string): boolean {
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(key);
}
