import { useEffect, type ReactNode } from 'react';
import type { FreshnessCheck } from '../domain/freshness';
import { Icon, type IconName } from './icons';

/** Panneau plein écran qui glisse du bas, adapté à l'iPhone. */
export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
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
        <button className="icon-btn" onClick={onClose} aria-label="Retour">
          <Icon name="back" />
        </button>
        <h2>{title}</h2>
        <span className="sheet-actions">{actions}</span>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

/** Grand titre d'écran (style iOS) avec sous-titre et actions à droite. */
export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="screen-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="screen-sub">{subtitle}</p>}
      </div>
      {actions && <div className="screen-actions">{actions}</div>}
    </header>
  );
}

export function IconButton({ icon, label, onClick, active }: { icon: IconName; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className={active ? 'icon-btn active' : 'icon-btn'} onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

/** Groupe de lignes façon Réglages iOS. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="list-group">
      {title && <h2 className="group-title">{title}</h2>}
      <div className="list">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

export function ListRow({
  icon,
  tint,
  label,
  detail,
  value,
  onClick,
  children,
}: {
  icon?: IconName;
  tint?: string;
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span className="row-icon" style={tint ? { background: tint } : undefined}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="row-text">
        <span className="row-label">{label}</span>
        {detail && <span className="row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {children}
      {onClick && <Icon name="chevron" size={18} className="row-chevron" />}
    </>
  );
  return onClick ? (
    <button className="list-row" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="list-row">{body}</div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <span className="toggle-label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
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
  const short = { veille: 'la veille', congeler: 'à congeler', trop_long: 'conservation dépassée', incoherent: 'incohérent', ok: '' }[check.status];
  if (long) return <p className={`note ${check.status}`}>{icon} {check.message}</p>;
  return <span className={`badge ${check.status}`}>{icon} {short}</span>;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export const nfr = (n: number, max = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(n);
export const portionLabel = (v: number) => `×${nfr(v)}`;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
export const COST_LABEL = { 1: '€', 2: '€€', 3: '€€€' } as const;

/** Pastille visuelle d'une recette (pas de photo pour les recettes maison). */
export const CATEGORY_EMOJI: Record<string, string> = {
  familial: '🍲',
  wrap_sandwich: '🌯',
  quiche_tarte: '🥧',
  pates_riz: '🍝',
  mijote: '🥘',
  bowl_salade: '🥗',
  monde: '🌶️',
  four: '🔥',
};
