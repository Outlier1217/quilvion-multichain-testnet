'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Bot, User } from 'lucide-react';
import { buyerChat } from '@/lib/api';

const SUGGESTIONS = [
  "What happens if I don't receive my product?",
  "How does escrow protection work?",
  "What is my refund window?",
  "How do I earn XP and upgrade my tier?",
];

interface Message { role: 'user' | 'assistant'; content: string; }

export function BuyerChat({ walletAddress }: { walletAddress: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your Quilvion shopping assistant. Ask me anything about products, escrow, disputes, or your account on Sui." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await buyerChat({ buyerWallet: walletAddress, message: text });
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-black mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          AI Shopping Assistant
        </h2>
        <p className="text-sm text-white/35">Powered by Groq LLaMA 3.3 70B · Knows Quilvion inside out</p>
      </div>

      {/* Chat window */}
      <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="h-96 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs
                ${msg.role === 'assistant'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-blue-500/20 text-blue-400'}`}>
                {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
              </div>
              <div className={`max-w-sm px-4 py-3 rounded-2xl text-sm leading-relaxed
                ${msg.role === 'assistant'
                  ? 'bg-white/5 text-white/80 rounded-tl-sm'
                  : 'text-white rounded-tr-sm'}`}
                style={msg.role === 'user' ? { background: 'rgba(77,162,255,0.15)', color: '#fff' } : {}}>
                {msg.content}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Bot size={14} className="text-indigo-400" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white/5 rounded-tl-sm">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-white/8 text-white/50 hover:text-white hover:border-white/20 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-white/5 p-3 flex gap-2">
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            placeholder="Ask anything about Quilvion..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/8 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#fff' }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}