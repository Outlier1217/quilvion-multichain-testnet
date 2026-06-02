'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Store, CheckCircle, Loader2, Building2, Globe, FileText, ChevronRight } from 'lucide-react';

interface MerchantOnboardProps {
  walletAddress: string;
  onClose: () => void;
  onSubmit: (data: MerchantData) => void;
  loading?: boolean;
}

export interface MerchantData {
  companyName: string;
  description: string;
  website: string;
  category: string;
  contactEmail: string;
}

const MERCHANT_CATEGORIES = [
  'Education', 'Templates', 'Services', 'Digital Art', 'Finance', 'Software', 'Other'
];

export function MerchantOnboard({ walletAddress, onClose, onSubmit, loading }: MerchantOnboardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<MerchantData>({
    companyName: '',
    description: '',
    website: '',
    category: '',
    contactEmail: '',
  });
  const [errors, setErrors] = useState<Partial<MerchantData>>({});

  const validate = () => {
    const errs: Partial<MerchantData> = {};
    if (!form.companyName.trim()) errs.companyName = 'Company name required';
    if (!form.description.trim() || form.description.length < 20)
      errs.description = 'Min 20 characters';
    if (!form.category) errs.category = 'Select a category';
    if (!form.contactEmail.includes('@')) errs.contactEmail = 'Valid email required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) setStep(2);
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form);
  };

  const field = (
    key: keyof MerchantData,
    label: string,
    placeholder: string,
    multiline = false
  ) => (
    <div>
      <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderColor: errors[key] ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)',
            color: '#fff',
          }}
        />
      ) : (
        <input
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderColor: errors[key] ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)',
            color: '#fff',
          }}
        />
      )}
      {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div className="relative w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: '#0d1020' }}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}>

        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
                <Store size={18} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Become a Merchant</h3>
                <p className="text-xs text-white/35">Step {step} of 2 — {step === 1 ? 'Company Info' : 'Review & Submit'}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
              <X size={14} className="text-white/60" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1 rounded-full bg-white/5">
            <motion.div className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg,#4DA2FF,#6366f1)' }}
              animate={{ width: step === 1 ? '50%' : '100%' }}
              transition={{ duration: 0.4 }} />
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} className="space-y-4">
                {field('companyName', 'Company / Brand Name', 'e.g. Web3Academy')}
                {field('description', 'What do you sell?', 'Describe your products or services (min 20 chars)...', true)}
                {field('contactEmail', 'Contact Email', 'you@example.com')}

                {/* Category */}
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {MERCHANT_CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => setForm(p => ({ ...p, category: cat }))}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        style={{
                          background: form.category === cat ? 'rgba(77,162,255,0.2)' : 'rgba(255,255,255,0.04)',
                          color: form.category === cat ? '#4DA2FF' : 'rgba(255,255,255,0.4)',
                          border: `1px solid ${form.category === cat ? 'rgba(77,162,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  {errors.category && <p className="text-xs text-red-400 mt-1">{errors.category}</p>}
                </div>

                {field('website', 'Website (optional)', 'https://yoursite.com')}
              </motion.div>
            ) : (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} className="space-y-4">
                {/* Review card */}
                <div className="p-4 rounded-2xl border border-white/8 space-y-3"
                  style={{ background: 'rgba(77,162,255,0.04)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 size={14} style={{ color: '#4DA2FF' }} />
                    <span className="text-sm font-bold text-white">{form.companyName}</span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(77,162,255,0.15)', color: '#4DA2FF' }}>
                      {form.category}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">{form.description}</p>
                  <div className="flex gap-4 text-xs text-white/35">
                    <span>📧 {form.contactEmail}</span>
                    {form.website && <span>🌐 {form.website}</span>}
                  </div>
                </div>

                {/* Wallet */}
                <div className="p-3 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="text-xs text-white/35 mb-1">Wallet (merchant payouts)</div>
                  <div className="text-xs font-mono text-white/60">{walletAddress}</div>
                </div>

                {/* Admin review note */}
                <div className="p-3 rounded-xl border border-yellow-400/20 flex gap-2.5"
                  style={{ background: 'rgba(245,158,11,0.06)' }}>
                  <FileText size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300/70">
                    Your application will be reviewed by Quilvion admin. Once approved, you can list products.
                    This usually takes a few minutes on testnet.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex gap-3">
          {step === 2 && (
            <button onClick={() => setStep(1)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white/40 hover:text-white/70 transition-colors">
              Back
            </button>
          )}
          <button
            onClick={step === 1 ? handleNext : handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Submitting...</>
            ) : step === 1 ? (
              <>Next <ChevronRight size={14} /></>
            ) : (
              <>Submit Application <CheckCircle size={14} /></>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}