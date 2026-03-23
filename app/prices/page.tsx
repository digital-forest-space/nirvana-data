'use client';

import { useState, useEffect } from 'react';

interface MarketPrice {
  market: string;
  price: number;
  floor: number;
  currency: string;
  updatedAt: string;
  priceSignature: string;
  error?: string;
}

export default function PricesPage() {
  const [prices, setPrices] = useState<Record<string, MarketPrice> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/prices')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setPrices(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading prices...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>Error: {error}</p>;
  if (!prices || Object.keys(prices).length === 0) return <p>No price data available.</p>;

  return (
    <div>
      <h1>Market Prices</h1>
      <table style={{ marginTop: '1.5rem', borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--foreground)', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem 1rem' }}>Market</th>
            <th style={{ padding: '0.5rem 1rem' }}>Price</th>
            <th style={{ padding: '0.5rem 1rem' }}>Floor</th>
            <th style={{ padding: '0.5rem 1rem' }}>Currency</th>
            <th style={{ padding: '0.5rem 1rem' }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(prices).map(([name, data]) => (
            <tr key={name} style={{ borderBottom: '1px solid var(--foreground)', opacity: data.error ? 0.5 : 1 }}>
              <td style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>{name}</td>
              {data.error ? (
                <td colSpan={4} style={{ padding: '0.5rem 1rem', color: '#ef4444' }}>{data.error}</td>
              ) : (
                <>
                  <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-geist-mono)' }}>
                    {data.price}
                  </td>
                  <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-geist-mono)' }}>
                    {data.floor}
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>{data.currency}</td>
                  <td style={{ padding: '0.5rem 1rem', opacity: 0.6, fontSize: '0.875rem' }}>
                    {new Date(data.updatedAt).toLocaleString()}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
