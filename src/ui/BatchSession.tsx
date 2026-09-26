import { useEffect, useMemo, useState } from 'react';
import type { Day } from '../domain/types';
import { APPLIANCE_LABELS, batchPlan, formatDuration } from '../domain/batchPlan';
import { dinerConsumption } from '../domain/portions';
import { aggregate } from '../domain/shopping';
import { formatQty } from '../domain/units';
import { PROFILE_IDS, dayDate, dayName, slotLabel } from '../domain/week';
import { todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { Sheet } from './common';
import { Icon } from './icons';
import { useDialog } from './dialog';
import { haptic, useWakeLock } from './ios';
import { useTimers } from './timers';

const clock = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const offset = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/**
 * Déroulé minuté d'une session de batch cooking : quoi lancer et quand pour que four et feux
 * travaillent en même temps, minuteurs d'un toucher, puis mise en boîtes étiquetées.
 */
export function BatchSession({ day, onClose }: { day: Day; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const dialog = useDialog();
  const timers = useTimers();
  const plan = state.plan;
  const key = `popote:batch:${plan.weekOf}:${day}`;
  const bp = useMemo(() => batchPlan(catalog, plan, state.profiles, day, state.equipment), [catalog, plan, state.profiles, day, state.equipment]);
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem(key);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  useWakeLock(startedAt !== null);
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const start = () => {
    haptic('medium');
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    try {
      sessionStorage.setItem(key, String(t));
    } catch {
      /* ignoré */
    }
  };
  const elapsed = startedAt ? Math.floor((now - startedAt) / 60000) : 0;
  const at = (m: number) => (startedAt ? clock(new Date(startedAt + m * 60000)) : offset(m));
  const nextIndex = bp.steps.findIndex((s, i) => !done[`${s.taskId}:${s.kind}:${i}`]);
  const appliances = [...new Set(bp.tasks.map((t) => t.appliance).filter((a) => a !== 'aucun'))];
  const plats = bp.tasks.filter((t) => t.kind === 'plat');
  const allCooked = plats.every((t) => t.sourceSlot && plan.slots[t.sourceSlot].cookedOn);

  const markAll = async () => {
    const ok = await dialog.confirm({
      title: 'Tout est cuisiné ?',
      message: 'Les quantités utilisées (plats et accompagnements) seront retirées du stock du frigo.',
      confirmLabel: 'Marquer comme cuisiné',
    });
    if (!ok) return;
    for (const t of plats) {
      if (!t.sourceSlot || plan.slots[t.sourceSlot].cookedOn) continue;
      const sides = t.servedSlots.flatMap((s) => PROFILE_IDS.flatMap((p) => dinerConsumption(catalog, plan, state.profiles, s, p).filter((l) => l.origin === 'accompagnement')));
      dispatch({ type: 'markCooked', slot: t.sourceSlot, lines: [...t.lines, ...sides], date: todayIso() });
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignoré */
    }
    onClose();
  };

  return (
    <Sheet title={`Session du ${dayName(plan, day).toLowerCase()} ${dayDate(plan, day)}`} onClose={onClose}>
      {bp.tasks.length === 0 ? (
        <p className="empty">Rien à cuisiner ce jour-là.</p>
      ) : (
        <>
          <section className="meal-hero">
            <div className="stats" style={{ margin: 0 }}>
              <div className="stat">
                <b>{formatDuration(bp.total)}</b>
                <span>en tout</span>
              </div>
              <div className="stat">
                <b>{formatDuration(bp.activeTotal)}</b>
                <span>aux fourneaux</span>
              </div>
              <div className="stat">
                <b>{plats.length}</b>
                <span>plat{plats.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <p className="small muted">
              Ordre calculé pour faire travailler {appliances.map((a) => APPLIANCE_LABELS[a]).join(', ') || 'le plan de travail'} en même temps : les cuissons longues d’abord, les accompagnements
              à la fin. Au plus 2 plats au four et 3 feux à la fois.
            </p>
            {startedAt === null ? (
              <button className="btn primary block" onClick={start}>
                <Icon name="play" size={16} /> Commencer maintenant (fin vers {clock(new Date(Date.now() + bp.total * 60000))})
              </button>
            ) : (
              <p className="note ok">
                Commencé à {clock(new Date(startedAt))} · {elapsed} min écoulées · fin prévue vers {clock(new Date(startedAt + bp.total * 60000))}. L’écran reste allumé.
              </p>
            )}
          </section>

          <ol className="timeline">
            {bp.steps.map((s, i) => {
              const id = `${s.taskId}:${s.kind}:${i}`;
              const late = startedAt !== null && !done[id] && s.at < elapsed - 5;
              return (
                <li key={id} className={`tl-${s.kind} ${done[id] ? 'done' : ''} ${i === nextIndex ? 'next' : ''} ${late ? 'late' : ''}`}>
                  <button
                    className="tl-check"
                    aria-label={done[id] ? 'Marquer à faire' : 'Marquer fait'}
                    onClick={() => {
                      haptic('light');
                      setDone((d) => ({ ...d, [id]: !d[id] }));
                    }}
                  >
                    {done[id] && <Icon name="check" size={14} />}
                  </button>
                  <span className="tl-time">{at(s.at)}</span>
                  <span className="tl-text">
                    {s.text}
                    {s.timer && s.kind === 'cuisson' && !done[id] && (
                      <button className="chip tl-timer" onClick={() => timers.start(`${s.text.split(' — ')[0].replace(/^.*: /, '')} · ${s.timer} min`, s.timer!)}>
                        <Icon name="clock" size={14} /> {s.timer} min
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
            <li className="tl-fin">
              <span className="tl-check" aria-hidden />
              <span className="tl-time">{at(bp.cookingEnd)}</span>
              <span className="tl-text">Portionner, fermer les boîtes, étiqueter, au frigo ou au congélateur (≈ 20 min)</span>
            </li>
          </ol>

          <details className="fold">
            <summary>Quantités à préparer</summary>
            {bp.tasks.map((t) => (
              <div key={t.id}>
                <p className="label" style={{ marginTop: 10 }}>
                  {t.name} · {t.servings} {t.kind === 'plat' ? 'repas' : 'portions'}
                </p>
                <ul className="qty-list">
                  {[...aggregate(t.lines, catalog).values()].map((a) => {
                    const ing = catalog.ingredients[a.ingredientId];
                    return (
                      <li key={a.ingredientId}>
                        <span>{ing.name}</span>
                        <strong>{formatQty(a.qty, a.unit, ing.pieceLabel)}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </details>

          <details className="fold" open>
            <summary>Étiquettes des boîtes ({bp.boxes.length})</summary>
            <ul className="plain small">
              {bp.boxes.map((b) => (
                <li key={b.slot}>
                  {b.freeze ? '❄️' : '🧊'} <strong>{slotLabel(plan, b.slot)}</strong> — {catalog.recipes[b.recipeId]?.name} ·{' '}
                  {b.diners.map((p) => state.profiles[p].name).join(' + ')}
                  {b.freeze && <span className="muted"> (congeler, décongeler au frigo la veille)</span>}
                </li>
              ))}
            </ul>
          </details>

          {!allCooked && (
            <button className="btn primary block" onClick={markAll}>
              <Icon name="check" size={18} /> Tout est cuisiné (mettre le frigo à jour)
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
