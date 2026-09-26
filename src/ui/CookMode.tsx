import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Recipe } from '../domain/types';
import { stepTimers, servingQty, type Servings } from '../domain/recipeTools';
import { formatQty, toIngredientUnit } from '../domain/units';
import { useCatalog, useStore } from '../state/store';
import { Icon } from './icons';
import { haptic, useWakeLock } from './ios';
import { formatRemaining, useTimers } from './timers';

/**
 * Mode cuisine : une étape par écran, en grand, écran toujours allumé.
 * Balayer (ou toucher les bords) pour changer d'étape ; les durées de l'étape deviennent des minuteurs.
 * À la fin : « c'était bon ? » nourrit les suggestions.
 */
export function CookMode({ recipe, servings, onClose }: { recipe: Recipe; servings: Servings; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const timers = useTimers();
  const [i, setI] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [dx, setDx] = useState(0);
  const g = useRef<{ x0: number; y0: number; lock: boolean | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  useWakeLock(true);
  const total = recipe.steps.length + 1; // + écran final
  const last = i === recipe.steps.length;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = window.setInterval(() => setNow(Date.now()), 500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  });

  const go = (d: number) => {
    setI((v) => {
      const n = Math.max(0, Math.min(total - 1, v + d));
      if (n !== v) haptic('light');
      return n;
    });
  };

  const fmt = (ri: Recipe['ingredients'][number]) => {
    const ing = catalog.ingredients[ri.ingredientId];
    const q = servingQty(ri, servings, state.profiles);
    const v = toIngredientUnit(q, ri.unit, ing);
    return v === null ? `${q} ${ri.unit}` : formatQty(v, ing.unit, ing.pieceLabel);
  };
  const step = recipe.steps[i];
  const stepTimerList = step ? stepTimers(step) : [];
  const mine = timers.timers.filter((t) => t.label.startsWith(recipe.name));

  return createPortal(
    <div
      className="cook"
      role="dialog"
      aria-modal="true"
      aria-label={`Mode cuisine : ${recipe.name}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        g.current = { x0: e.clientX, y0: e.clientY, lock: null };
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerMove={(e) => {
        e.stopPropagation();
        const s = g.current;
        if (!s) return;
        const mx = e.clientX - s.x0;
        const my = e.clientY - s.y0;
        if (s.lock === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) s.lock = Math.abs(mx) > Math.abs(my);
        if (s.lock) setDx(mx);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (g.current?.lock && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        g.current = null;
        setDx(0);
      }}
      onPointerCancel={() => {
        g.current = null;
        setDx(0);
      }}
    >
      <header className="cook-head">
        <button className="icon-btn" onClick={onClose} aria-label="Quitter le mode cuisine">
          <Icon name="close" />
        </button>
        <div className="cook-progress" aria-label={`Étape ${Math.min(i + 1, recipe.steps.length)} sur ${recipe.steps.length}`}>
          {recipe.steps.map((_, k) => (
            <i key={k} className={k < i ? 'past' : k === i ? 'now' : ''} />
          ))}
        </div>
        <button className={showIngredients ? 'icon-btn active' : 'icon-btn'} onClick={() => setShowIngredients((v) => !v)} aria-label="Ingrédients">
          <Icon name="book" />
        </button>
      </header>

      {showIngredients && (
        <div className="cook-ingredients">
          <ul className="qty-list">
            {recipe.ingredients.map((ri) => (
              <li key={ri.ingredientId}>
                <span>{catalog.ingredients[ri.ingredientId].name}</span>
                <strong>{fmt(ri)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="cook-body" style={{ transform: `translateX(${dx * 0.4}px)` }}>
        {!last ? (
          <>
            <p className="cook-step-num">
              Étape {i + 1} <span>/ {recipe.steps.length}</span>
            </p>
            <p className="cook-step">{step}</p>
            {stepTimerList.length > 0 && (
              <div className="cook-timers">
                {stepTimerList.map((t) => (
                  <button key={t.minutes} className="btn primary" onClick={() => timers.start(`${recipe.name} · ${t.label}`, t.minutes)}>
                    <Icon name="clock" size={18} /> Minuteur {t.label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="cook-end">
            <p className="cook-end-emoji" aria-hidden>
              🍽️
            </p>
            <p className="cook-step">Bon appétit !</p>
            <p className="muted">C’était bon ? Popote s’en souviendra pour les prochaines suggestions.</p>
            <div className="action-row">
              <button
                className={state.ratings[recipe.id] === 1 ? 'btn primary' : 'btn'}
                onClick={() => {
                  haptic('medium');
                  dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: 1 });
                }}
              >
                👍 On aime
              </button>
              <button
                className={state.ratings[recipe.id] === -1 ? 'btn danger-soft' : 'btn'}
                onClick={() => {
                  haptic('medium');
                  dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: -1 });
                }}
              >
                👎 Bof
              </button>
            </div>
            <button className="btn block" onClick={onClose}>
              Terminer
            </button>
          </div>
        )}
      </main>

      {mine.length > 0 && (
        <div className="cook-running">
          {mine.map((t) => (
            <span key={t.id} className={t.done ? 'badge trop_long' : 'badge info'}>
              ⏱ {t.label.split(' · ')[1]} : {t.done ? 'terminé' : formatRemaining(t.endsAt - now)}
            </span>
          ))}
        </div>
      )}

      <footer className="cook-nav">
        <button className="btn" onClick={() => go(-1)} disabled={i === 0}>
          <Icon name="back" size={18} /> Précédente
        </button>
        {!last && (
          <button className="btn primary" onClick={() => go(1)}>
            {i === recipe.steps.length - 1 ? 'Terminé' : 'Suivante'} <Icon name="chevron" size={18} />
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
