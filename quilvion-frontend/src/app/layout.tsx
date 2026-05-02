import type { Metadata } from 'next';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['700', '800'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Quilvion — Multichain Commerce Platform',
  description: 'Buy and sell digital products across Ethereum, Solana, Sui, and Aptos — protected by on-chain escrow.',
  keywords: ['web3', 'commerce', 'blockchain', 'sui', 'solana', 'ethereum', 'aptos', 'escrow', 'USDC'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body style={{ margin: 0, padding: 0, background: '#050510' }}>
        {children}
      </body>
    </html>
  );
}