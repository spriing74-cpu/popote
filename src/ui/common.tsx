import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FreshnessCheck } from '../domain/freshness';
import { Icon, type IconName } from './icons';
import { haptic } from './ios';

let sheetDepth = 0;

/**
 * Écran empilé façon iOS : il arrive par la droite, se ferme avec « ‹ », Échap, le bouton retour
 * du téléphone, ou en balayant depuis le bord gauche (l'écran suit le doigt, l'écran précédent
 * apparaît dessous).
 */
export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closed = useRef(false);
  const depth = useRef(0);

  /** Fermeture animée ; `fromHistory` : l'entrée d'historique est déjà retirée. */
  const requestClose = useCallback((fromHistory = false) => {
    if (closed.current) return;
    closed.current = true;
    setLeaving(true);
    if (!fromHistory && history.state?.sheetDepth === depth.current) history.back();
    window.setTimeout(() => closeRef.current(), 260);
  }, []);

  useEffect(() => {
    sheetDepth += 1;
    depth.current = sheetDepth;
    history.pushState({ ...(history.state ?? {}), sheetDepth: depth.current }, '');
    const onPop = () => {
      if ((history.state?.sheetDepth ?? 0) < depth.current) requestClose(true);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && depth.current === sheetDepth && requestClose();
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      sheetDepth -= 1;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // Fermé par le parent (ex. recette choisie) : l'entrée d'historique devient celle du niveau
      // inférieur. (Un history.back() ici, asynchrone, fermerait l'écran suivant.)
      if (!closed.current && history.state?.sheetDepth === depth.current) history.replaceState({ ...history.state, sheetDepth: depth.current - 1 }, '');
    };
  }, [requestClose]);

  // Balayage depuis le bord gauche.
  const g = useRef<{ id: number; x0: number; y0: number; t0: number; lock: boolean | null } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.clientX > 28 || leaving) return;
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, lock: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x0;
    const my = e.clientY - s.y0;
    if (s.lock === null) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      s.lock = mx > Math.abs(my);
      if (!s.lock) {
        g.current = null;
        return;
      }
      ref.current?.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setDx(Math.max(0, mx));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || !s.lock) return;
    setDragging(false);
    const w = ref.current?.offsetWidth ?? 375;
    const velocity = dx / Math.max(1, e.timeStamp - s.t0);
    if (dx > w * 0.35 || velocity > 0.6) {
      haptic('light');
      requestClose();
    } else setDx(0);
  };

  const style = leaving
    ? { transform: 'translate3d(100%,0,0)', transition: 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)' }
    : { transform: `translate3d(${dx}px,0,0)`, transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)' };

  return (
    <>
      <div className="sheet-dim" style={{ opacity: leaving ? 0 : 1 - dx / (ref.current?.offsetWidth ?? 375) }} aria-hidden />
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          g.current = null;
          setDragging(false);
          setDx(0);
        }}
      >
        <header className="sheet-header">
          <button className="icon-btn" onClick={() => requestClose()} aria-label="Retour">
            <Icon name="back" />
          </button>
          <h2>{title}</h2>
          <span className="sheet-actions">{actions}</span>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/** Grand titre d'écran (style iOS) avec sous-titre et actions à droite. */
export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  // Quand le grand titre sort de l'écran, une barre compacte (titre centré, flou) prend le relais.
  const sentinel = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className={compact ? 'nav-compact visible' : 'nav-compact'} aria-hidden={!compact}>
        <span>{title}</span>
        {actions && <div className="screen-actions">{actions}</div>}
      </div>
      <header className="screen-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="screen-sub">{subtitle}</p>}
        </div>
        {actions && <div className="screen-actions">{actions}</div>}
      </header>
      <div ref={sentinel} className="header-sentinel" aria-hidden />
    </>
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
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'active' : ''}
          onClick={() => {
            if (value !== o.id) haptic('light');
            onChange(o.id);
          }}
        >
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
      {/* `switch` : interrupteur natif d'iOS 18, avec son retour haptique. */}
      <input type="checkbox" {...{ switch: '' }} checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
      <button type="button" onClick={() => (haptic('light'), onChange(round(Math.max(min, value - step))))} disabled={value <= min} aria-label="Diminuer">
        −
      </button>
      <span className="stepper-value">{format ? format(value) : value}</span>
      <button type="button" onClick={() => (haptic('light'), onChange(round(Math.min(max, value + step))))} disabled={value >= max} aria-label="Augmenter">
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
