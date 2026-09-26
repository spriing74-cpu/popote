import { useEffect, type ReactNode } from 'react';
import type { FreshnessCheck } from '../domain/freshness';

/** Panneau plein écran (feuille modale) adapté à l'iPhone. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="sheet-header">
        <button className="btn-link" onClick={onClose}>
          ‹ Retour
        </button>
        <h2>{title}</h2>
        <span className="sheet-spacer" />
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={active ? 'chip active' : 'chip'} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 10, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(round(Math.max(min, value - step)))} disabled={value <= min} aria-label="Diminuer">
        −
      </button>
      <span className="stepper-value">{format ? format(value) : value}</span>
      <button type="button" onClick={() => onChange(round(Math.min(max, value + step)))} disabled={value >= max} aria-label="Augmenter">
        +
      </button>
    </div>
  );
}

export function FreshnessBadge({ check, long }: { check: FreshnessCheck | null; long?: boolean }) {
  if (!check || check.status === 'ok') return long && check ? <p className="note ok">✓ {check.message}</p> : null;
  const icon = { veille: '🌙', congeler: '❄️', trop_long: '⚠️', incoherent: '⚠️', ok: '' }[check.status];
  const short = { veille: 'à assembler la veille', congeler: 'à congeler', trop_long: 'conservation dépassée', incoherent: 'incohérent', ok: '' }[check.status];
  if (long) return <p className={`note ${check.status}`}>{icon} {check.message}</p>;
  return <span className={`badge ${check.status}`}>{icon} {short}</span>;
}

export const nfr = (n: number, max = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(n);
export const portionLabel = (v: number) => `×${nfr(v)}`;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
export const COST_LABEL = { 1: '€', 2: '€€', 3: '€€€' } as const;
