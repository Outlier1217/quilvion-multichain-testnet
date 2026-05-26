'use client';
import { motion } from 'framer-motion';
import { TrendingUp, ShoppingBag, Star, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

interface Order {
  id: number;
  productName: string;
  amountUsdc: number;
  status: string;
  createdAt: string;
  buyerWallet?: string;
}

interface MerchantStatsProps {
  orders: Order[];
  companyName: string;
  category: string;
  onDeliver?: (orderId: number) => void;
  loading?: boolean;
}

export function MerchantStats({ orders, companyName, category, onDeliver, loading }: MerchantStatsProps) {
  const totalRevenue = orders
    .filter(o => o.status === 'COMPLETED')
    .reduce((sum, o) => sum + o.amountUsdc, 0);

  const pending = orders.filter(o => o.status === 'PENDING').length;
  const completed = orders.filter(o => o.status === 'COMPLETED').length;
  const disputed = orders.filter(o => o.status === 'DISPUTED').length;
  const successRate = orders.length > 0 ? Math.round((completed / orders.length) * 100) : 100;

  const stats = [
    { label: 'Total Revenue', value: `$${totalRevenue}`, sub: 'USDC earned', icon: TrendingUp, color: '#10b981' },
    { label: 'Total Orders', value: orders.length, sub: `${pending} pending`, icon: ShoppingBag, color: '#4DA2FF' },
    { label: 'Success Rate', value: `${successRate}%`, sub: `${completed} completed`, icon: Star, color: '#f59e0b' },
    { label: 'Disputes', value: disputed, sub: disputed > 0 ? 'Needs attention' : 'Clean record', icon: AlertTriangle, color: disputed > 0 ? '#ef4444' : '#6366f1' },
  ];

  return (
    <div className="space-y-6">
      {/* Merchant identity card */}
      <div className="p-5 rounded-2xl border border-white/8"
        style={{ background: 'linear-gradient(135deg, rgba(77,162,255,0.06), rgba(99,102,241,0.06))' }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            🏪
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{companyName}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                <CheckCircle size={9} /> Verified
              </span>
            </div>
            <p className="text-xs text-white/35 mt-0.5">{category} · Merchant on Sui Testnet</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/30">Rating</div>
            <div className="font-bold text-yellow-400">4.8 ★</div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="p-4 rounded-2xl border border-white/5"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <s.icon size={14} style={{ color: s.color }} className="mb-2" />
            <div className="text-xl font-black" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-xs text-white/30 mt-0.5">{s.label}</div>
            <div className="text-xs text-white/20 mt-0.5">{s.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Orders table */}
      <div>
        <h4 className="text-sm font-bold text-white/70 mb-3">Recent Orders</h4>
        {orders.length === 0 ? (
          <div className="text-center py-10 text-white/25">
            <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No orders yet — your products are live!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(order => (
              <div key={order.id}
                className="flex items-center gap-4 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate">{order.productName}</div>
                  {order.buyerWallet && (
                    <div className="text-xs text-white/30 mt-0.5 font-mono truncate">
                      {order.buyerWallet.slice(0, 20)}...
                    </div>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-white text-sm">${order.amountUsdc}</div>
                  <div className="text-xs text-white/30">{order.createdAt}</div>
                </div>

                <span className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{
                    background:
                      order.status === 'COMPLETED' ? 'rgba(16,185,129,0.15)' :
                      order.status === 'PENDING' ? 'rgba(245,158,11,0.15)' :
                      order.status === 'DISPUTED' ? 'rgba(239,68,68,0.15)' :
                      'rgba(255,255,255,0.08)',
                    color:
                      order.status === 'COMPLETED' ? '#10b981' :
                      order.status === 'PENDING' ? '#f59e0b' :
                      order.status === 'DISPUTED' ? '#ef4444' :
                      'rgba(255,255,255,0.4)',
                  }}>
                  {order.status === 'COMPLETED' && '✓ '}
                  {order.status === 'PENDING' && '⏳ '}
	                  {order.status === 'DISPUTED' && '⚠ '}
	                  {order.status}
	                </span>

                  {order.status === 'PENDING' && onDeliver && (
                    <button
                      onClick={() => onDeliver(order.id)}
                      disabled={loading}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)', color: '#fff' }}>
                      Deliver
                    </button>
                  )}
	              </div>
	            ))}
          </div>
        )}
      </div>
    </div>
  );
}