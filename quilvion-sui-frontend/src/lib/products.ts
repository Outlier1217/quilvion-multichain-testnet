// src/lib/products.ts
// Mock product data — replace with DB/API when PostgreSQL is ready

export interface Product {
  id: number;
  name: string;
  description: string;
  priceUsdc: number;
  category: string;
  emoji: string;
  merchantWallet: string;
  merchantName: string;
  merchantOrders: number;
  merchantSuccessRate: number;
  rating: number;
  reviewCount: number;
  tags: string[];
}

export const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Complete Web3 Development Bootcamp",
    description: "A comprehensive 40-hour course covering Solidity, Move, and Rust. Build 5 real dApps from scratch with hands-on projects and code reviews.",
    priceUsdc: 89,
    category: "Education",
    emoji: "🎓",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "Web3Academy",
    merchantOrders: 234,
    merchantSuccessRate: 0.98,
    rating: 4.9,
    reviewCount: 189,
    tags: ["Solidity", "Move", "Beginner-friendly"],
  },
  {
    id: 2,
    name: "DeFi Analytics Dashboard Template",
    description: "Production-ready Next.js dashboard with real-time price feeds, portfolio tracking, and on-chain analytics. Includes 3 months of updates.",
    priceUsdc: 149,
    category: "Templates",
    emoji: "📊",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "DevForge",
    merchantOrders: 89,
    merchantSuccessRate: 0.96,
    rating: 4.7,
    reviewCount: 67,
    tags: ["Next.js", "TypeScript", "DeFi"],
  },
  {
    id: 3,
    name: "Smart Contract Audit Report",
    description: "Professional security audit for your Move or Solidity smart contract. Delivered within 48 hours with detailed vulnerability report and fix recommendations.",
    priceUsdc: 299,
    category: "Services",
    emoji: "🔐",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "SecureChain",
    merchantOrders: 45,
    merchantSuccessRate: 1.0,
    rating: 5.0,
    reviewCount: 43,
    tags: ["Security", "Move", "Audit"],
  },
  {
    id: 4,
    name: "NFT Collection Art Pack — 10K Generative",
    description: "10,000 unique generative art assets with 150+ traits. Includes Photoshop source files, metadata generator script, and IPFS upload guide.",
    priceUsdc: 49,
    category: "Digital Art",
    emoji: "🎨",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "PixelForge",
    merchantOrders: 567,
    merchantSuccessRate: 0.97,
    rating: 4.8,
    reviewCount: 412,
    tags: ["NFT", "Generative", "Art"],
  },
  {
    id: 5,
    name: "Trading Signals Alpha — 30 Day Access",
    description: "AI-powered crypto trading signals with 73% historical accuracy. Covers top 50 assets across 4 chains. Telegram bot included.",
    priceUsdc: 75,
    category: "Finance",
    emoji: "📈",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "AlphaSignals",
    merchantOrders: 1240,
    merchantSuccessRate: 0.94,
    rating: 4.6,
    reviewCount: 891,
    tags: ["Trading", "AI", "Signals"],
  },
  {
    id: 6,
    name: "Rust Systems Programming Masterclass",
    description: "Advanced Rust for blockchain developers. Memory management, async programming, and building high-performance on-chain programs. 25 hours of content.",
    priceUsdc: 65,
    category: "Education",
    emoji: "⚙️",
    merchantWallet: "0x5ae3c435809e3bb32c22284ab148eac5403bdf09d44c49d2ebd0405bd95707a4",
    merchantName: "RustLab",
    merchantOrders: 178,
    merchantSuccessRate: 0.99,
    rating: 4.9,
    reviewCount: 134,
    tags: ["Rust", "Advanced", "Blockchain"],
  },
];

export const CATEGORIES = ["All", "Education", "Templates", "Services", "Digital Art", "Finance"];