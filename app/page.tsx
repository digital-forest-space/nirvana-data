export default function Home() {
  return (
    <div>
      <h1>Nirvana Data</h1>
      <p style={{ marginTop: '1rem', opacity: 0.7 }}>
        View Nirvana Protocol market data and wallet information.
      </p>
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        <a href="/prices" style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--foreground)', borderRadius: '0.5rem' }}>
          View Prices
        </a>
        <a href="/markets" style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--foreground)', borderRadius: '0.5rem' }}>
          View Markets
        </a>
        <a href="/wallet" style={{ padding: '0.75rem 1.5rem', border: '1px solid var(--foreground)', borderRadius: '0.5rem' }}>
          Wallet Lookup
        </a>
      </div>
    </div>
  );
}
