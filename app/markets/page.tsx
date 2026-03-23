'use client';

import { useState, useEffect } from 'react';

interface NavMarket {
  name: string;
  baseName: string;
  baseMint: string;
  navMint: string;
  mayflowerMarket: string;
  baseDecimals: number;
  navDecimals: number;
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<NavMarket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/markets')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setMarkets(data.markets);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading markets...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>Error: {error}</p>;
  if (!markets || markets.length === 0) return <p>No markets configured.</p>;

  return (
    <div>
      <h1>Nav Markets</h1>
      <table style={{ marginTop: '1.5rem', borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--foreground)', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem 1rem' }}>Name</th>
            <th style={{ padding: '0.5rem 1rem' }}>Base</th>
            <th style={{ padding: '0.5rem 1rem' }}>Base Decimals</th>
            <th style={{ padding: '0.5rem 1rem' }}>Nav Decimals</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => (
            <tr key={market.name} style={{ borderBottom: '1px solid var(--foreground)' }}>
              <td style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>{market.name}</td>
              <td style={{ padding: '0.5rem 1rem' }}>{market.baseName}</td>
              <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-geist-mono)' }}>{market.baseDecimals}</td>
              <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-geist-mono)' }}>{market.navDecimals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
