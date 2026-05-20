'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

const sections = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using the Quilvion platform ("Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Platform. Quilvion is a decentralized commerce protocol — use of the Platform constitutes acceptance of both these terms and the inherent nature of blockchain-based transactions.`,
  },
  {
    title: '2. Wallet as Identity',
    content: `Quilvion operates on a wallet-first identity model. By connecting your Web3 wallet (MetaMask, Phantom, Slush, Petra, or any compatible wallet), you represent that you are the sole authorized user of that wallet. Your wallet address serves as your identity, payment method, and reputation layer on the Platform. You are solely responsible for the security of your private keys and wallet access.`,
  },
  {
    title: '3. Escrow & Transactions',
    content: `All purchases made through Quilvion are protected by on-chain smart contract escrow deployed on the Sui, Ethereum, Solana, or Aptos blockchains. Upon purchase, funds are locked in escrow until delivery is confirmed or a dispute is resolved. Quilvion does not custody user funds directly — all settlement is enforced by immutable smart contracts. Once a transaction is confirmed on-chain, it cannot be reversed except through the dispute resolution process outlined herein.`,
  },
  {
    title: '4. AI Fraud Detection',
    content: `Quilvion uses an XGBoost machine learning model to analyze transactions in real time. Transactions may be automatically held or blocked based on risk scoring. This system is designed to protect buyers and merchants from fraudulent activity. Quilvion makes no guarantee that all fraud will be detected or prevented. Users may appeal transaction decisions through the dispute system.`,
  },
  {
    title: '5. Dispute Resolution',
    content: `Buyers may raise a dispute within the refund window defined by smart contract configuration. Once raised, the order status becomes DISPUTED and is reviewed by a Quilvion admin assisted by AI-generated summaries. The admin may resolve disputes by (a) releasing funds to the merchant or (b) issuing a refund to the buyer. Admin decisions are executed on-chain and are final. Quilvion reserves the right to adjust merchant reputation scores based on dispute outcomes.`,
  },
  {
    title: '6. Merchant Responsibilities',
    content: `Merchants using the Platform are responsible for accurately describing products, fulfilling orders promptly, and maintaining a positive reputation score. Merchants who repeatedly fail to deliver or lose disputes will have their accounts reviewed and may be suspended or removed from the marketplace. Merchants agree not to list prohibited items including but not limited to: illegal goods, stolen digital assets, harmful software, or misleading products.`,
  },
  {
    title: '7. Prohibited Activities',
    content: `Users may not use the Platform to: engage in money laundering or financial fraud; list or purchase illegal products or services; manipulate reputation systems; conduct coordinated fraudulent purchasing; exploit smart contract vulnerabilities; impersonate other users or entities; or violate any applicable law or regulation. Violation of these terms may result in immediate suspension without notice.`,
  },
  {
    title: '8. Intellectual Property',
    content: `The Quilvion name, logo, interface design, and platform architecture are the intellectual property of Quilvion and its contributors. The underlying smart contracts are open-source under the Apache 2.0 License. Users retain ownership of content they upload to the marketplace, but grant Quilvion a non-exclusive license to display that content on the Platform.`,
  },
  {
    title: '9. Disclaimers & Limitation of Liability',
    content: `THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. Quilvion does not guarantee uptime, transaction finality outside of blockchain consensus, or the quality of merchant products. To the maximum extent permitted by law, Quilvion's liability is limited to the value of the disputed transaction. Blockchain transactions are irreversible by nature — users accept this risk by using the Platform.`,
  },
  {
    title: '10. Testnet Notice',
    content: `Quilvion is currently deployed on testnets (Sui Testnet and equivalent test environments for other chains). Testnet tokens have no real monetary value. Data, funds, and reputation scores on testnet may be reset without notice. These terms will apply in full upon mainnet deployment.`,
  },
  {
    title: '11. Changes to Terms',
    content: `Quilvion reserves the right to modify these Terms of Service at any time. Changes will be communicated via the Platform interface. Continued use of the Platform after changes constitutes acceptance of the updated terms.`,
  },
  {
    title: '12. Contact',
    content: `For questions about these terms, please reach out via the GitHub repository at github.com/Outlier1217/quilvion-multichain-testnet or connect with the developer on LinkedIn at linkedin.com/in/mustak1217.`,
  },
];

export default function TermsPage() {
  return (
    <main
      className="min-h-screen"
      style={{ background: '#050510', color: '#fff', fontFamily: 'var(--font-body)' }}
    >
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: '#6366f1' }} />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-8" style={{ background: '#4DA2FF' }} />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/logo.png" alt="Quilvion" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Quilvion</span>
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>
      </nav>

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
          >
            Legal
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>
            Terms of Service
          </h1>
          <p className="text-white/40 text-sm mb-2">Last updated: January 2026</p>
          <p className="text-white/50 text-base leading-relaxed mb-12">
            These terms govern your use of the Quilvion decentralized commerce protocol. Please read them carefully before connecting your wallet or making any transactions.
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
              transition={{ delay: i * 0.05 }}
            >
              <h2 className="text-lg font-bold text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                {section.title}
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">{section.content}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-indigo-500/20 text-center"
          style={{ background: 'rgba(99,102,241,0.08)' }}>
          <p className="text-sm text-white/50">
            © 2026 Quilvion. Developed by{' '}
            <a href="https://www.linkedin.com/in/mustak1217/" target="_blank" rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 transition-colors">
              Mustak Aalam
            </a>
            . Powered by AI & Blockchain.

          </p>
        </div>
      </div>
    </main>
  );
}