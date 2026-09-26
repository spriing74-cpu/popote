import { useMemo, useState } from 'react';
import type { SlotId } from '../domain/types';
import { checkFreshness } from '../domain/freshness';
import { suggestPlan } from '../domain/planner';
import { cookingPlanFor, dinerConsumption } from '../domain/portions';
import { aggregate } from '../domain/shopping';
import { formatQty } from '../domain/units';
import {
  DAYS,
  DAY_LABELS,
  MEALS,
  MEAL_LABELS,
  PROFILE_IDS,
  SLOT_IDS,
  dateForDay,
  effectiveRecipeId,
  leftoverTargets,
  presentProfiles,
  slotId,
  slotLabel,
  upcomingSaturday,
} from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { todayIso } from '../domain/inventory';
import { stockEntries, stockUrgencyMap } from '../domain/antigaspi';
import { FreshnessBadge } from './common';
import { SlotEditor } from './SlotEditor';

type View = 'repas' | 'preparation';

export function PlanningScreen({ goTo }: { goTo: (t: 'courses') => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [view, setView] = useState<View>('repas');
  const [editing, setEditing] = useState<SlotId | null>(null);
  const plan = state.plan;
  const filled = SLOT_IDS.filter((id) => effectiveRecipeId(plan, id)).length;

  const suggest = (onlyEmpty: boolean) => {
    if (!onlyEmpty && filled > 0 && !confirm('Reproposer tous les repas ? Vos choix actuels seront remplacés (les convives sont conservés).')) return;
    const seed = Math.floor(Math.random() * 1e9);
    const learning = {
      ratings: state.ratings,
      recentWeeks: state.history.map((h) => h.recipeIds),
      stockUrgency: stockUrgencyMap(state.inventory, catalog, todayIso()),
    };
    dispatch({ type: 'setPlan', plan: suggestPlan(catalog, plan, state.profiles, state.settings, state.favorites, { seed, onlyEmpty, learning }) });
  };

  const newWeek = () => {
    if (!confirm('Commencer une nouvelle semaine ? Le planning et les cases cochées seront vidés (placard, prix et réglages conservés).')) return;
    dispatch({ type: 'newWeek', weekOf: upcomingSaturday() });
  };

  return (
    <div className="screen">
      <h1>Planning</h1>
      <div className="row gap wrap align-center">
        <label className="field-inline grow">
          <span>Samedi</span>
          <input type="date" value={plan.weekOf ?? ''} onChange={(e) => dispatch({ type: 'setWeekOf', weekOf: e.target.value || null })} />
        </label>
      </div>
      <div className="row gap wrap">
        <button className="btn primary" onClick={() => suggest(true)} disabled={filled === 10}>
          ✨ Compléter les cases vides
        </button>
        <button className="btn" onClick={() => suggest(false)}>
          🔄 Tout reproposer
        </button>
        <button className="btn" onClick={newWeek}>
          Nouvelle semaine
        </button>
      </div>
      <p className="muted small">
        {filled}/10 repas choisis. Les suggestions varient d’une semaine à l’autre, privilégient ce que vous aimez et ce qui périme dans le frigo, et respectent la boîte froide du midi, la conservation et vos exclusions. Tout reste modifiable.
      </p>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={view === 'repas'} className={view === 'repas' ? 'active' : ''} onClick={() => setView('repas')}>
          Repas
        </button>
        <button role="tab" aria-selected={view === 'preparation'} className={view === 'preparation' ? 'active' : ''} onClick={() => setView('preparation')}>
          Préparation (batch)
        </button>
      </div>

      {view === 'repas' ? (
        <div className="stack">
          {DAYS.map((d) => (
            <section key={d} className="day">
              <h2 className="day-title">
                {DAY_LABELS[d]} <span className="muted">{dateForDay(plan.weekOf, d) ?? ''}</span>
              </h2>
              {MEALS.map((m) => {
                const id = slotId(d, m);
                return <SlotRow key={id} id={id} label={MEAL_LABELS[m]} onOpen={() => setEditing(id)} />;
              })}
            </section>
          ))}
          <button className="btn primary block" onClick={() => goTo('courses')}>
            Voir la liste de courses →
          </button>
        </div>
      ) : (
        <PrepView onOpen={setEditing} />
      )}

      {editing && <SlotEditor id={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SlotRow({ id, label, onOpen }: { id: SlotId; label: string; onOpen: () => void }) {
  const { state } = useStore();
  const catalog = useCatalog();
  const plan = state.plan;
  const slot = plan.slots[id];
  const rid = effectiveRecipeId(plan, id);
  const recipe = rid ? catalog.recipes[rid] : null;
  const present = presentProfiles(slot);
  const targets = leftoverTargets(plan, id);
  const fresh = checkFreshness(catalog, plan, id);
  const savesStock = useMemo(() => {
    if (!recipe || slot.leftoverOf) return [];
    const urgent = stockEntries(state.inventory, catalog, todayIso()).filter((e) => e.daysLeft !== null && e.daysLeft <= 5);
    return urgent.filter((e) => recipe.ingredients.some((i) => i.ingredientId === e.ingredientId)).map((e) => catalog.ingredients[e.ingredientId].name.toLowerCase());
  }, [recipe, slot.leftoverOf, state.inventory, catalog]);

  return (
    <button className={`slot ${recipe ? '' : 'slot-empty'}`} onClick={onOpen}>
      <span className="slot-meal">{label}</span>
      <span className="slot-main">
        <span className="slot-title">{recipe ? recipe.name : present.length === 0 ? 'Personne' : '+ Choisir un repas'}</span>
        <span className="slot-sub">
          {present.length === 2 ? 'À deux' : present.length === 1 ? `${state.profiles[present[0]].name} seul·e` : 'Aucun convive'}
          {slot.leftoverOf && <span className="badge info">♻️ restes de {slotLabel(slot.leftoverOf).toLowerCase()}</span>}
          {targets.length > 0 && <span className="badge info">+ restes pour {targets.length} repas</span>}
          {slot.extraPortions > 0 && !slot.leftoverOf && <span className="badge info">+{slot.extraPortions} portion(s)</span>}
          <FreshnessBadge check={fresh} />
          {savesStock.length > 0 && <span className="badge ok-badge">🧊 écoule : {savesStock.slice(0, 2).join(', ')}</span>}
          {recipe && state.ratings[recipe.id] === 1 && <span className="badge">👍</span>}
          {slot.note && <span className="badge">{slot.note}</span>}
        </span>
      </span>
      <span className="chevron" aria-hidden>
        ›
      </span>
    </button>
  );
}

/** Vue batch cooking : ce qu'il faut cuisiner chaque jour de préparation, quantités totales comprises. */
function PrepView({ onOpen }: { onOpen: (id: SlotId) => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const plan = state.plan;

  const groups = useMemo(() => {
    return DAYS.map((d) => {
      const items = SLOT_IDS.filter((id) => plan.slots[id].prepDay === d)
        .map((id) => cookingPlanFor(catalog, plan, state.profiles, id))
        .filter((c): c is NonNullable<typeof c> => c !== null && c.servings > 0)
        .map((c) => {
          const sideLines = c.servedSlots.flatMap((s) =>
            PROFILE_IDS.flatMap((p) => dinerConsumption(catalog, plan, state.profiles, s, p).filter((l) => l.origin === 'accompagnement')),
          );
          return {
            ...c,
            sideLines,
            dish: [...aggregate(c.lines, catalog).values()],
            sides: [...aggregate(sideLines, catalog).values()],
            checks: c.servedSlots.map((s) => ({ s, f: checkFreshness(catalog, plan, s) })),
          };
        });
      return { day: d, items };
    }).filter((g) => g.items.length > 0);
  }, [plan, state.profiles, catalog]);

  if (groups.length === 0) return <p className="empty">Choisissez des repas pour voir le programme de préparation.</p>;

  return (
    <div className="stack">
      <p className="muted small">
        Quantités crues totales à cuisiner, restes réservés et portions en plus compris. Refroidissez rapidement (moins de 2 h), répartissez en boîtes et étiquetez avec le jour.
      </p>
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="day-title">Session du {DAY_LABELS[g.day].toLowerCase()}</h2>
          {g.items.map((it) => {
            const r = catalog.recipes[it.recipeId];
            return (
              <article key={it.sourceSlot} className="card">
                <button className="linkish" onClick={() => onOpen(it.sourceSlot)}>
                  <h3>{r.name}</h3>
                </button>
                <p className="muted small">
                  {it.servings} repas · pour {it.servedSlots.map((s) => slotLabel(s).toLowerCase()).join(', ')}
                  {plan.slots[it.sourceSlot].extraPortions > 0 && ` + ${plan.slots[it.sourceSlot].extraPortions} portion(s) en plus`}
                </p>
                <ul className="qty-list">
                  {it.dish.map((a) => {
                    const ing = catalog.ingredients[a.ingredientId];
                    return (
                      <li key={a.ingredientId}>
                        <span>{ing.name}</span>
                        <strong>
                          {formatQty(a.qty, a.unit, ing.pieceLabel)}
                          {a.unconvertible.map((u) => ` + ${formatQty(u.qty, u.unit)}`).join('')}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
                {it.sides.length > 0 && (
                  <>
                    <p className="small">
                      <strong>Accompagnements à prévoir</strong>
                    </p>
                    <ul className="qty-list">
                      {it.sides.map((a) => {
                        const ing = catalog.ingredients[a.ingredientId];
                        return (
                          <li key={a.ingredientId}>
                            <span>{ing.name}</span>
                            <strong>{formatQty(a.qty, a.unit, ing.pieceLabel)}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {plan.slots[it.sourceSlot].cookedOn ? (
                  <p className="note ok">✓ Cuisiné le {new Date(plan.slots[it.sourceSlot].cookedOn + 'T12:00:00').toLocaleDateString('fr-FR')} : stock du frigo mis à jour.</p>
                ) : (
                  <button
                    className="btn block"
                    onClick={() => {
                      if (!confirm('Marquer ce plat comme cuisiné ? Les quantités utilisées (plat et accompagnements) seront retirées du stock du frigo.')) return;
                      dispatch({ type: 'markCooked', slot: it.sourceSlot, lines: [...it.lines, ...it.sideLines], date: todayIso() });
                    }}
                  >
                    ✓ C’est cuisiné (retirer du frigo)
                  </button>
                )}
                {it.checks
                  .filter((c) => c.f && c.f.status !== 'ok')
                  .map((c) => (
                    <p key={c.s} className={`note ${c.f!.status}`}>
                      <strong>{slotLabel(c.s)} :</strong> {c.f!.message}
                    </p>
                  ))}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
