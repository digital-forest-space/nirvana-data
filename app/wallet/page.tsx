'use client';

import { useState } from 'react';

interface TokenBalance {
  balance: number;
  account: string | null;
}

interface Balances {
  ana: TokenBalance;
  nirv: TokenBalance;
  usdc: TokenBalance;
  prana: TokenBalance;
}

interface Staking {
  accountAddress: string;
  stakedAna: number;
  stakedPrana: number;
  debtNirv: number;
  borrowableNirv: number;
  claimableAnaRevshare: number;
  claimableNirvRevshare: number;
}

interface Claimable {
  token: string;
  amount: number;
}

export default function WalletPage() {
  const [address, setAddress] = useState('');
  const [balances, setBalances] = useState<Balances | null>(null);
  const [staking, setStaking] = useState<Staking | null>(null);
  const [claimable, setClaimable] = useState<Claimable | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function lookup() {
    if (!address.trim()) return;
    setLoading(true);
    setBalances(null);
    setStaking(null);
    setClaimable(null);
    setErrors({});

    const addr = address.trim();

    const results = await Promise.allSettled([
      fetch(`/api/users/${addr}/balances`).then((r) => r.json()),
      fetch(`/api/users/${addr}/staking`).then((r) => r.json()),
      fetch(`/api/users/${addr}/claimable/prana`).then((r) => r.json()),
    ]);

    const newErrors: Record<string, string> = {};

    if (results[0].status === 'fulfilled') {
      const data = results[0].value;
      if (data.error) newErrors.balances = data.error;
      else setBalances(data);
    }

    if (results[1].status === 'fulfilled') {
      const data = results[1].value;
      if (data.error) newErrors.staking = data.error;
      else setStaking(data);
    }

    if (results[2].status === 'fulfilled') {
      const data = results[2].value;
      if (data.error) newErrors.claimable = data.error;
      else setClaimable(data);
    }

    setErrors(newErrors);
    setLoading(false);
  }

  const mono = { fontFamily: 'var(--font-geist-mono)' };

  return (
    <div>
      <h1>Wallet Lookup</h1>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="Enter Solana wallet address"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--foreground)',
            borderRadius: '0.5rem',
            background: 'transparent',
            color: 'var(--foreground)',
            width: '400px',
            ...mono,
          }}
        />
        <button
          onClick={lookup}
          disabled={loading}
          style={{
            padding: '0.5rem 1.5rem',
            border: '1px solid var(--foreground)',
            borderRadius: '0.5rem',
            background: 'var(--foreground)',
            color: 'var(--background)',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading...' : 'Lookup'}
        </button>
      </div>

      {balances && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Token Balances</h2>
          <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', maxWidth: '400px' }}>
            <tbody>
              {Object.entries(balances).map(([token, data]) => (
                <tr key={token} style={{ borderBottom: '1px solid var(--foreground)' }}>
                  <td style={{ padding: '0.5rem 1rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{token}</td>
                  <td style={{ padding: '0.5rem 1rem', ...mono }}>{data.balance.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {staking && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Staking</h2>
          <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', maxWidth: '400px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem' }}>Staked ANA</td>
                <td style={{ padding: '0.5rem 1rem', ...mono }}>{staking.stakedAna.toFixed(6)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem' }}>Staked PRANA</td>
                <td style={{ padding: '0.5rem 1rem', ...mono }}>{staking.stakedPrana.toFixed(6)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem' }}>Debt (NIRV)</td>
                <td style={{ padding: '0.5rem 1rem', ...mono }}>{staking.debtNirv.toFixed(6)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem' }}>Borrowable (NIRV)</td>
                <td style={{ padding: '0.5rem 1rem', ...mono }}>{staking.borrowableNirv.toFixed(6)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {claimable && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Claimable</h2>
          <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', maxWidth: '400px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>{claimable.token}</td>
                <td style={{ padding: '0.5rem 1rem', ...mono }}>{claimable.amount.toFixed(6)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          {Object.entries(errors).map(([key, msg]) => (
            <p key={key} style={{ color: '#ef4444', marginTop: '0.25rem' }}>
              {key}: {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
