'use client';
// ── RiskBadge ─────────────────────────────────────────────────────────────────
export function RiskBadge({ score, level }: { score: number; level: string }) {
  const config = {
    LOW:      { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Low Risk' },
    MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Medium Risk' },
    HIGH:     { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'High Risk' },
    CRITICAL: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)',  label: 'Critical' },
  }[level] ?? { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: level };

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: config.bg, color: config.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.color }} />
      {score}/100 · {config.label}
    </span>
  );
}