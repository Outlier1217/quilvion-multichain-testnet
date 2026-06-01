'use client';
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Loader2, Tag, DollarSign, Package, Upload } from 'lucide-react';
import { API_BASE } from '@/lib/sui/constants';

export interface MerchantProduct {
  name: string;
  description: string;
  priceUsdc: number;
  category: string;
  emoji: string;
  tags: string[];
  deliveryInfo: string;
  images: string[];
}

interface MerchantProductFormProps {
  onClose: () => void;
  onSubmit: (product: MerchantProduct) => void;
  loading?: boolean;
  editProduct?: MerchantProduct & { id?: string | number };  // ← edit mode
}

const EMOJIS = ['🎓','📊','🔐','🎨','📈','⚙️','🛠️','💡','🚀','📱','🎵','✍️','🤖','🌐','💎'];
const CATEGORIES = ['Education', 'Templates', 'Services', 'Digital Art', 'Finance', 'Software', 'Other'];
const API = API_BASE;

export function MerchantProductForm({ onClose, onSubmit, loading, editProduct }: MerchantProductFormProps) {
  const isEdit = !!editProduct;

  const [form, setForm] = useState<MerchantProduct>(editProduct ?? {
    name: '', description: '', priceUsdc: 0,
    category: '', emoji: '🎓', tags: [], deliveryInfo: '', images: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof MerchantProduct, string>>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = () => {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Product name required';
    if (form.description.length < 30) errs.description = 'Min 30 characters';
    if (!form.priceUsdc || form.priceUsdc <= 0) errs.priceUsdc = 'Price must be > 0';
    if (!form.category) errs.category = 'Select a category';
    if (!form.deliveryInfo.trim()) errs.deliveryInfo = 'Delivery/access info required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t) && form.tags.length < 5) {
      setForm(p => ({ ...p, tags: [...p.tags, t] }));
      setTagInput('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 4 - form.images.length;
    const toUpload = files.slice(0, remaining);
    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of toUpload) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const res = await fetch(`${API}/api/merchant/product/upload-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        if (res.ok) {
          const data = await res.json();
          uploadedUrls.push(data.url);
        }
      }
      setForm(p => ({ ...p, images: [...p.images, ...uploadedUrls] }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== index) }));
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div className="relative w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: '#0d1020' }}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}>

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(77,162,255,0.15)' }}>
              <Package size={16} style={{ color: '#4DA2FF' }} />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {isEdit ? 'Edit Product' : 'Add New Product'}
              </h3>
              <p className="text-xs text-white/35">
                {isEdit ? 'Changes save immediately' : 'Max 4 images · Admin review before publishing'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center">
            <X size={14} className="text-white/60" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">

          {/* Image upload */}
          <div>
            <label className="block text-xs text-white/40 mb-2 uppercase tracking-wider">
              Product Images <span className="normal-case text-white/20">({form.images.length}/4)</span>
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {form.images.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={url} alt={`Product ${i+1}`} className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(i)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <X size={16} className="text-white" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(77,162,255,0.8)', fontSize: '9px' }}>
                      MAIN
                    </span>
                  )}
                </div>
              ))}
              {form.images.length < 4 && (
                <button onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all hover:border-blue-400/40"
                  style={{ border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)' }}>
                  {uploadingImage
                    ? <Loader2 size={16} className="text-white/40 animate-spin" />
                    : <><Upload size={14} className="text-white/30" /><span className="text-xs text-white/25">Add</span></>
                  }
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            <p className="text-xs text-white/20">JPG, PNG, WebP · Max 4 · First = main display</p>
          </div>

          {/* Emoji */}
          <div>
            <label className="block text-xs text-white/40 mb-2 uppercase tracking-wider">Icon (agar image nahi)</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(p => ({ ...p, emoji: e }))}
                  className="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all"
                  style={{
                    background: form.emoji === e ? 'rgba(77,162,255,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${form.emoji === e ? 'rgba(77,162,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    transform: form.emoji === e ? 'scale(1.15)' : 'scale(1)',
                  }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Product Name</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Solidity Masterclass 2025"
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: errors.name ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)', color: '#fff' }} />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Describe your product in detail (min 30 chars)..." rows={3}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: errors.description ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)', color: '#fff' }} />
            {errors.description && <p className="text-xs text-red-400 mt-1">{errors.description}</p>}
          </div>

          {/* ✨ AI Generate button */}
<div className="flex justify-end mt-1">
  <button
    type="button"
    onClick={async () => {
      if (!form.name && !form.tags.length) return;
      setGenerating(true);
      try {
        const res = await fetch(`${API}/api/merchant/generate-description`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            category: form.category,
            tags: form.tags,
            price: form.priceUsdc,
          }),
        });
        const data = await res.json();
        if (data.description) setForm(p => ({ ...p, description: data.description }));
      } catch {}
      finally { setGenerating(false); }
    }}
    disabled={generating || (!form.name && !form.tags.length)}
    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
    style={{ background: 'rgba(77,162,255,0.12)', color: '#4DA2FF' }}>
    {generating
      ? <><Loader2 size={11} className="animate-spin" /> Generating...</>
      : <>✨ AI Generate</>
    }
  </button>
</div>

          {/* Price + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Price (USDC)</label>
              <div className="relative">
                <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input type="number" min="1" value={form.priceUsdc || ''}
                  onChange={e => setForm(p => ({ ...p, priceUsdc: parseFloat(e.target.value) || 0 }))}
                  placeholder="49" className="w-full pl-8 pr-4 py-3 rounded-xl border text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: errors.priceUsdc ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)', color: '#fff' }} />
              </div>
              {errors.priceUsdc && <p className="text-xs text-red-400 mt-1">{errors.priceUsdc}</p>}
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: errors.category ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)', color: form.category ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                <option value="" disabled style={{ background: '#0d1020' }}>Select...</option>
                {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0d1020', color: '#fff' }}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-red-400 mt-1">{errors.category}</p>}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">
              Tags <span className="normal-case text-white/20">(max 5)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="e.g. Solidity"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#fff' }} />
              </div>
              <button onClick={addTag} className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                style={{ background: 'rgba(77,162,255,0.15)', color: '#4DA2FF' }}>
                <Plus size={16} />
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(tag => (
                  <span key={tag} onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full cursor-pointer hover:opacity-70"
                    style={{ background: 'rgba(77,162,255,0.12)', color: '#4DA2FF', border: '1px solid rgba(77,162,255,0.2)' }}>
                    {tag} <X size={9} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Delivery info */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">Delivery / Access Info</label>
            <textarea value={form.deliveryInfo} onChange={e => setForm(p => ({ ...p, deliveryInfo: e.target.value }))}
              placeholder="How will buyer receive the product? (download link, email, etc.)" rows={2}
              className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: errors.deliveryInfo ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)', color: '#fff' }} />
            {errors.deliveryInfo && <p className="text-xs text-red-400 mt-1">{errors.deliveryInfo}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5">
          <button onClick={() => { if (validate()) onSubmit(form); }}
            disabled={loading || uploadingImage}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4DA2FF,#6366f1)' }}>
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> {isEdit ? 'Saving...' : 'Submitting...'}</>
              : isEdit ? 'Save Changes' : 'Submit for Admin Review'
            }
          </button>
          {!isEdit && <p className="text-center text-xs text-white/25 mt-2">Product goes live after admin approval</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}