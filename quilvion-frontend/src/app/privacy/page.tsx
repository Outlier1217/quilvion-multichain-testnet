'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

const sections = [
  {
    title: '1. Overview',
    content: `Quilvion is built on a privacy-first, wallet-native identity model. Unlike traditional e-commerce platforms, Quilvion does not require you to create an account, provide an email address, or share personal information to browse or transact on the marketplace. Your wallet address is your identity.`,
  },
  {
    title: '2. Information We Collect',
    content: `On-Chain Data: All blockchain interactions — including wallet addresses, transaction hashes, escrow events, and reputation scores — are recorded publicly on the respective blockchain (Sui, Ethereum, Solana, or Aptos). This data is inherently public and not controlled by Quilvion.\n\nOff-Chain Data (PostgreSQL): Quilvion's backend stores marketplace metadata including product listings, merchant profiles, order metadata, and AI-generated content. This data is necessary to operate the marketplace and is stored securely on Neon PostgreSQL infrastructure.\n\nProduct Images: Uploaded product images are stored via Cloudinary CDN. Images are processed and delivered through Cloudinary's global infrastructure.\n\nAI Interaction Data: When you use the AI Buyer Assistant or other LLM-powered features, your queries are processed by Groq's LLaMA 3.3 70B model. Quilvion does not permanently store individual AI conversation logs beyond what is needed for fraud analysis.`,
  },
  {
    title: '3. How We Use Your Information',
    content: `We use collected data to: operate the marketplace and process transactions; perform real-time fraud analysis via our XGBoost ML engine; generate AI-assisted dispute summaries and merchant risk profiles; maintain buyer reputation and XP tier systems; improve platform security and detect suspicious behavior; and comply with applicable legal obligations.`,
  },
  {
    title: '4. Fraud Detection & AI Analysis',
    content: `Every transaction on Quilvion is analyzed by our AI fraud detection engine. This analysis uses wallet age, transaction history, order value, and behavioral signals to assign a risk score. This process is automatic and is designed to protect both buyers and merchants. High-risk transactions may be blocked without prior notice. You may contact us to appeal a blocked transaction.`,
  },
  {
    title: '5. Data Sharing',
    content: `Quilvion does not sell your data to third parties. We share data only with: blockchain networks (inherently public); Groq API for LLM processing; Cloudinary for image hosting; Neon for database infrastructure. All third-party providers are required to handle data in accordance with applicable privacy laws.`,
  },
  {
    title: '6. Sensitive Information',
    content: `If a transaction requires sharing sensitive information such as shipping addresses or contact details, this information is shared only between buyer and merchant and only for the duration necessary to fulfill the order. You may request removal of such information after order completion by contacting us through GitHub or LinkedIn.`,
  },
  {
    title: '7. Wallet Privacy',
    content: `Quilvion does not associate your wallet address with your real-world identity unless you voluntarily provide that information. Your wallet history on public blockchains is publicly visible by design — this is a property of blockchain infrastructure, not Quilvion's data practices. We recommend using a wallet address you are comfortable making public.`,
  },
  {
    title: '8. Cookies & Tracking',
    content: `Quilvion uses minimal client-side storage (session data, wallet connection state) to provide a functional experience. We do not use third-party advertising trackers, social media pixels, or behavioral analytics services that profile users for advertising purposes.`,
  },
  {
    title: '9. Data Retention',
    content: `On-chain data is permanent by the nature of blockchain. Off-chain marketplace data is retained as long as your merchant profile or order history is active on the platform. You may request deletion of off-chain data by contacting us — however, on-chain records cannot be deleted.`,
  },
  {
    title: '10. Security',
    content: `Quilvion employs smart contract role-based access control, treasury isolation, and spend-limit enforcement to protect on-chain assets. Off-chain data is stored in encrypted cloud infrastructure. Admin routes are protected by secret-key authentication. Despite these measures, no system is perfectly secure — users should exercise caution and never share private keys.`,
  },
  {
    title: '11. Testnet Notice',
    content: `Quilvion is currently operating on testnet environments. Data collected during the testnet phase may be reset, deleted, or migrated without notice upon mainnet launch. Do not share real personal or financial information during the testnet phase.`,
  },
  {
    title: '12. Changes to This Policy',
    content: `We may update this Privacy Policy as the platform evolves. Material changes will be communicated through the platform interface. Continued use after updates constitutes acceptance of the revised policy.`,
  },
  {
    title: '13. Contact',
    content: `For privacy inquiries or data deletion requests, please contact us via the GitHub repository at github.com/Outlier1217/quilvion-multichain-testnet or reach out to the developer at linkedin.com/in/mustak1217.`,
  },
];

export default function PrivacyPage() {
  return (
    <main
      className="min-h-screen"
      style={{ background: '#050510', color: '#fff', fontFamily: 'var(--font-body)' }}
    >
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: '#4DA2FF' }} />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 rounded-full blur-3xl opacity-8" style={{ background: '#00B4AB' }} />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="Quilvion" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Quilvion</span>
        </Link>
        <Link href="/" className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={14} />
          Back to Home
        </Link>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: 'rgba(77,162,255,0.15)', border: '1px solid rgba(77,162,255,0.3)', color: '#93c5fd' }}
          >
            Legal
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Privacy Policy
          </h1>
          <p className="text-white/40 text-sm mb-2">Last updated: January 2026</p>
          <p className="text-white/50 text-base leading-relaxed mb-12">
            Quilvion is designed with privacy at its core. Your wallet is your identity — we collect only what is necessary to operate a secure, fair, and decentralized commerce protocol.
          </p>
        </motion.div>

        <div className="space-y-8">
          {sections.map((section, i) => (
            <motion.div
              key={section.title}
              className="p-6 rounded-2xl border border-white/5"
              style={{ background: 'rgba(255,255,255,0.02)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <h2 className="text-lg font-bold text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                {section.title}
              </h2>
              <p className="text-sm text-white/50 leading-relaxed whitespace-pre-line">{section.content}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-blue-500/20 text-center"
          style={{ background: 'rgba(77,162,255,0.06)' }}>
          <p className="text-sm text-white/50">
            © 2026 Quilvion. Developed by{' '}
            <a href="https://www.linkedin.com/in/mustak1217/" target="_blank" rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors">
              Mustak Aalam
            </a>
            . Powered by AI & Blockchain.
          </p>
        </div>
      </div>
    </main>
  );
}