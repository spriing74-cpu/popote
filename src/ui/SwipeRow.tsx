import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from './ios';
import { Icon, type IconName } from './icons';

export interface SwipeAction {
  label: string;
  icon: IconName;
  /** Couleur de fond du bouton révélé. */
  color: string;
  onAction: () => void;
}

const ACTION_W = 76;
/** Une seule ligne ouverte à la fois, comme dans Mail ou Rappels. */
let closeOpenRow: (() => void) | null = null;

/**
 * Ligne balayable façon iOS : glisser vers la droite révèle `leading`, vers la gauche `trailing`.
 * Un balayage complet déclenche la première action (avec un retour haptique au passage du seuil).
 * Le défilement vertical reste natif (`touch-action: pan-y`).
 */
export function SwipeRow({ leading = [], trailing = [], children, className }: { leading?: SwipeAction[]; trailing?: SwipeAction[]; children: ReactNode; className?: string }) {
  const [x, setXState] = useState(0);
  // Position courante, lisible même avant le rendu suivant (gestes rapides).
  const xRef = useRef(0);
  const setX = (v: number) => {
    xRef.current = v;
    setXState(v);
  };
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<{ id: number; x0: number; y0: number; base: number; lock: 'h' | 'v' | null; armed: boolean; moved: boolean } | null>(null);
  const swiped = useRef(false);
  const wasOpen = useRef(false);
  const width = () => ref.current?.offsetWidth ?? 360;
  const full = () => width() * 0.55;

  // Fonction stable : sert d'identifiant de « la ligne ouverte ».
  const close = useRef(() => {
    xRef.current = 0;
    setXState(0);
  }).current;
  useEffect(
    () => () => {
      if (closeOpenRow === close) closeOpenRow = null;
    },
    [close],
  );

  const run = (a: SwipeAction) => {
    haptic('medium');
    setX(0);
    a.onAction();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    swiped.current = false;
    wasOpen.current = xRef.current !== 0;
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: xRef.current, lock: null, armed: false, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (s.lock === 'h') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.lock !== 'h') return;
    s.moved = true;
    let nx = s.base + dx;
    if (nx > 0 && leading.length === 0) nx = 0;
    if (nx < 0 && trailing.length === 0) nx = 0;
    // Résistance au-delà du balayage complet.
    const limit = width() * 0.8;
    if (Math.abs(nx) > limit) nx = Math.sign(nx) * (limit + (Math.abs(nx) - limit) * 0.25);
    const armed = Math.abs(nx) > full();
    if (armed !== s.armed) {
      s.armed = armed;
      haptic('light');
    }
    setX(nx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    setDragging(false);
    if (!s || s.lock !== 'h') return;
    swiped.current = true;
    const cur = xRef.current;
    const actions = cur > 0 ? leading : trailing;
    if (s.armed && actions[0]) {
      run(actions[0]);
      return;
    }
    const open = actions.length * ACTION_W;
    if (Math.abs(cur) > Math.min(open, ACTION_W) * 0.6) {
      setX(Math.sign(cur) * open);
      closeOpenRow = close;
    } else setX(0);
    e.preventDefault();
  };
  const onClickCapture = (e: React.MouseEvent) => {
    // Un balayage ne doit pas ouvrir la ligne ; une ligne ouverte se referme d'abord.
    if (swiped.current || wasOpen.current) {
      e.preventDefault();
      e.stopPropagation();
      if (!swiped.current) setX(0);
      swiped.current = false;
      wasOpen.current = false;
    }
  };

  const side = x > 0 ? leading : trailing;
  const armed = Math.abs(x) > full();
  return (
    <div className={`swipe-row ${className ?? ''}`} ref={ref}>
      {x !== 0 && (
        <div className={`swipe-actions ${x > 0 ? 'leading' : 'trailing'}`} style={{ width: Math.abs(x) }}>
          {side.map((a, i) => (
            <button
              key={a.label}
              className="swipe-action"
              style={{
                background: a.color,
                flex: armed ? (i === 0 ? 1 : 0) : 1,
                minWidth: armed && i !== 0 ? 0 : undefined,
                padding: armed && i !== 0 ? 0 : undefined,
              }}
              onClick={() => run(a)}
            >
              {!(armed && i !== 0) && (
                <>
                  <Icon name={a.icon} size={20} />
                  <span>{a.label}</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <div
        className="swipe-content"
        style={{ transform: `translate3d(${x}px,0,0)`, transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          g.current = null;
          setDragging(false);
        }}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
