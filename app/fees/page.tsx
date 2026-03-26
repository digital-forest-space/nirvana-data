'use client';

import { useState, useEffect } from 'react';

interface NavMarketFees {
  market: string;
  buyFeePercent: number;
  sellFeePercent: number;
  borrowFeePercent: number;
  exerciseOptionFeePercent: number;
}

interface AnaFees {
  sellFeePercent: number;
}

interface FeesData {
  ANA: AnaFees;
  navMarkets: Record<string, NavMarketFees>;
  fetchedAt: string;
}

const cellStyle = { padding: '0.5rem 1rem', fontFamily: 'var(--font-geist-mono)' };
const headerStyle = { padding: '0.5rem 1rem' };

function formatPercent(value: number): string {
  return `${value}%`;
}

export default function FeesPage() {
  const [fees, setFees] = useState<FeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/fees')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setFees(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading fees...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>Error: {error}</p>;
  if (!fees) return <p>No fee data available.</p>;

  const navMarkets = Object.values(fees.navMarkets);

  return (
    <div>
      <h1>Protocol Fees</h1>

      <h2 style={{ marginTop: '2rem' }}>ANA</h2>
      <table style={{ marginTop: '0.75rem', borderCollapse: 'collapse', maxWidth: '300px' }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--foreground)' }}>
            <td style={headerStyle}>Sell Fee</td>
            <td style={cellStyle}>{formatPercent(fees.ANA.sellFeePercent)}</td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ marginTop: '2rem' }}>NAV Markets</h2>
      {navMarkets.length === 0 ? (
        <p>No NAV market fees available.</p>
      ) : (
        <table style={{ marginTop: '0.75rem', borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--foreground)', textAlign: 'left' }}>
              <th style={headerStyle}>Market</th>
              <th style={headerStyle}>Buy</th>
              <th style={headerStyle}>Sell</th>
              <th style={headerStyle}>Borrow</th>
              <th style={headerStyle}>Exercise Option</th>
            </tr>
          </thead>
          <tbody>
            {navMarkets.map((m) => (
              <tr key={m.market} style={{ borderBottom: '1px solid var(--foreground)' }}>
                <td style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>{m.market}</td>
                <td style={cellStyle}>{formatPercent(m.buyFeePercent)}</td>
                <td style={cellStyle}>{formatPercent(m.sellFeePercent)}</td>
                <td style={cellStyle}>{formatPercent(m.borrowFeePercent)}</td>
                <td style={cellStyle}>{formatPercent(m.exerciseOptionFeePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '1.5rem', opacity: 0.5, fontSize: '0.875rem' }}>
        Cached at: {new Date(fees.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
