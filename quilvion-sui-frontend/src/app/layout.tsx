import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-display', weight: ['700', '800'] });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'Quilvion · Sui — Multichain Commerce',
  description: 'Buy digital products on Sui with USDC — escrow protected, AI fraud detection.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body style={{ margin: 0, background: '#05050f' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}