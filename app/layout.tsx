import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nirvana Data",
  description: "Nirvana Protocol data viewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav style={{
          padding: '1rem 2rem',
          borderBottom: '1px solid var(--foreground)',
          display: 'flex',
          gap: '2rem',
          fontFamily: 'var(--font-geist-sans)',
          opacity: 0.8,
        }}>
          <a href="/" style={{ fontWeight: 'bold' }}>Nirvana Data</a>
          <a href="/prices">Prices</a>
          <a href="/markets">Markets</a>
          <a href="/fees">Fees</a>
          <a href="/wallet">Wallet</a>
        </nav>
        <main style={{ padding: '2rem', fontFamily: 'var(--font-geist-sans)' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
