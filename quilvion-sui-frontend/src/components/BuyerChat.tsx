'use client';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2, Bot, User } from 'lucide-react';
import { buyerChat } from '@/lib/api';

const SUGGESTIONS = [
  "How does escrow work?",
  "What if I don't receive my product?",
  "How do I raise a dispute?",
  "What is my refund window?",
];

interface Message { role: 'user' | 'assistant'; content: string; products?: any[]; }

export function BuyerChat({ walletAddress }: { walletAddress: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm Quilvion's AI assistant. Ask me anything about products, escrow, or disputes." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await buyerChat({ buyerWallet: walletAddress, message: text });
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: res.reply,
        products: res.products?.slice(0, 3) // max 3 products show karo
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <img src="/logo.png" alt="Quilvion" className="w-8 h-8 rounded-lg object-contain" />
        <div>
          <h2 className="text-lg font-black" style={{ fontFamily: 'var(--font-display)' }}>
            AI Shopping Assistant
          </h2>
          <p className="text-xs text-white/35">Powered by LLaMA 3.3 70B · Always brief & helpful</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)' }}>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
                ${msg.role === 'assistant' ? 'bg-indigo-500/20' : 'bg-blue-500/20'}`}>
                {msg.role === 'assistant'
                  ? <Bot size={12} className="text-indigo-400" />
                  : <User size={12} className="text-blue-400" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-xs px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                ${msg.role === 'assistant'
                  ? 'bg-white/5 text-white/80 rounded-tl-sm'
                  : 'rounded-tr-sm text-white'}`}
                style={msg.role === 'user'
                  ? { background: 'rgba(77,162,255,0.15)' }
                  : {}}>
                {msg.content}
              </div>
            </motion.div>
          ))}


          {messages.map((msg, i) => (
  <motion.div key={i}
    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
    className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
      ${msg.role === 'assistant' ? 'bg-indigo-500/20' : 'bg-blue-500/20'}`}>
      {msg.role === 'assistant'
        ? <Bot size={12} className="text-indigo-400" />
        : <User size={12} className="text-blue-400" />
      }
    </div>

    <div className="flex flex-col gap-2 max-w-xs">
      <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
        ${msg.role === 'assistant'
          ? 'bg-white/5 text-white/80 rounded-tl-sm'
          : 'rounded-tr-sm text-white'}`}
        style={msg.role === 'user' ? { background: 'rgba(77,162,255,0.15)' } : {}}>
        {msg.content}
      </div>

      {/* Product chips — sirf assistant messages mein */}
      {msg.role === 'assistant' && msg.products && msg.products.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {msg.products.map((p: any) => (
            <button
              key={p.id}
              onClick={() => {
                // Tab switch karke marketplace pe le jao
                window.location.href = `/?highlight=${p.id}`;
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(77,162,255,0.08)', border: '1px solid rgba(77,162,255,0.15)' }}>
              <span className="text-lg">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                <div className="text-xs text-white/40">${p.price_usdc} USDC · {p.category}</div>
              </div>
              <span className="text-xs text-blue-400 flex-shrink-0">View →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  </motion.div>
))}

          {/* Loading dots */}
          {loading && (
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Bot size={12} className="text-indigo-400" />
              </div>
              <div className="px-3.5 py-2.5 rounded-2xl bg-white/5 rounded-tl-sm">
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i}
                      className="w-1.5 h-1.5 rounded-full bg-white/30"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions — only on first message */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/8 text-white/45 hover:text-white/80 hover:border-white/20 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-white/5 p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="Ask anything..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-white/8 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#fff' }}
          />
          <button onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}