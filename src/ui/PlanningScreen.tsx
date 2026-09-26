import { useMemo, useState } from 'react';
import type { SlotId } from '../domain/types';
import { checkFreshness } from '../domain/freshness';
import { suggestPlan, withRecipe } from '../domain/planner';
import { cookingPlanFor, dinerConsumption } from '../domain/portions';
import { aggregate } from '../domain/shopping';
import { formatQty } from '../domain/units';
import {
  MAX_DAYS,
  MEALS,
  MEAL_LABELS,
  PROFILE_IDS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  addDays,
  dateOf,
  dayDate,
  dayIds,
  dayName,
  effectiveRecipeId,
  leftoverTargets,
  planRange,
  presentProfiles,
  slotId,
  slotIds,
  slotLabel,
  upcomingWeekday,
  weekdayOf,
} from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { todayIso } from '../domain/inventory';
import { stockEntries, stockUrgencyMap } from '../domain/antigaspi';
import { CATEGORY_EMOJI, Chip, Empty, FreshnessBadge, IconButton, ScreenHeader, Segmented, Sheet, Stepper } from './common';
import { Icon } from './icons';
import { MealSheet } from './MealSheet';
import { BatchSession } from './BatchSession';
import { batchPlan, formatDuration } from '../domain/batchPlan';
import type { Day } from '../domain/types';
import { SwipeRow } from './SwipeRow';
import { useDialog } from './dialog';
import { haptic, useLongPress } from './ios';
import type { Tab } from '../App';

type View = 'repas' | 'preparation';

export function PlanningScreen({ goTo }: { goTo: (t: Tab) => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [view, setView] = useState<View>('repas');
  const [open, setOpen] = useState<{ id: SlotId; pick?: boolean } | null>(null);
  const dialog = useDialog();
  const [weekSheet, setWeekSheet] = useState(false);
  const plan = state.plan;
  const ids = slotIds(plan);
  const filled = ids.filter((id) => effectiveRecipeId(plan, id)).length;
  const today = todayIso();

  const suggest = async (onlyEmpty: boolean) => {
    if (
      !onlyEmpty &&
      filled > 0 &&
      !(await dialog.confirm({ title: 'Tout refaire ?', message: 'Vos choix actuels seront remplacés (les convives sont conservés).', confirmLabel: 'Reproposer tous les repas', destructive: true }))
    )
      return;
    haptic('medium');
    const seed = Math.floor(Math.random() * 1e9);
    const learning = {
      ratings: state.ratings,
      recentWeeks: state.history.map((h) => h.recipeIds),
      stockUrgency: stockUrgencyMap(state.inventory, catalog, todayIso()),
    };
    dispatch({ type: 'setPlan', plan: suggestPlan(catalog, plan, state.profiles, state.settings, state.favorites, { seed, onlyEmpty, learning }) });
  };

  const jump = (d: string) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="screen">
      <ScreenHeader
        title="Semaine"
        subtitle={`${planRange(plan)} · ${plan.days} jour${plan.days > 1 ? 's' : ''}`}
        actions={<IconButton icon="sliders" label="Dates et durée" onClick={() => setWeekSheet(true)} />}
      />

      <div className="week-bar">
        <div className="progress" aria-hidden>
          <span style={{ width: `${(filled / ids.length) * 100}%` }} />
        </div>
        <span className="progress-label">
          {filled}/{ids.length} repas
        </span>
      </div>

      <div className="action-row">
        <button className="btn primary" onClick={() => suggest(true)} disabled={filled === ids.length}>
          <Icon name="sparkles" size={18} /> {filled === 0 ? 'Proposer la semaine' : 'Compléter'}
        </button>
        {filled > 0 && (
          <button className="btn" onClick={() => suggest(false)}>
            <Icon name="refresh" size={18} /> Tout refaire
          </button>
        )}
      </div>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'repas', label: 'Repas' },
          { id: 'preparation', label: 'Batch cooking' },
        ]}
      />

      {view === 'repas' ? (
        <>
          <nav className="day-strip" aria-label="Aller au jour">
            {dayIds(plan).map((d) => {
              const iso = dateOf(plan, d);
              return (
                <button key={d} className={iso === today ? 'day-pill glass today' : 'day-pill glass'} onClick={() => jump(d)}>
                  <span className="dp-wd">{WEEKDAY_SHORT[weekdayOf(plan, d)]}</span>
                  <span className="dp-num">{Number(iso.slice(8))}</span>
                  <span className="dp-dots">
                    {MEALS.map((m) => (
                      <i key={m} className={effectiveRecipeId(plan, slotId(d, m)) ? 'on' : ''} />
                    ))}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="stack">
            {dayIds(plan).map((d) => (
              <section key={d} id={`day-${d}`} className="day">
                <h2 className="day-title">
                  {dayName(plan, d)} <span className="muted">{dayDate(plan, d)}</span>
                  {dateOf(plan, d) === today && <span className="badge accent">Aujourd’hui</span>}
                </h2>
                {MEALS.map((m) => {
                  const id = slotId(d, m);
                  return <SlotRow key={id} id={id} onOpen={(pick) => setOpen({ id, pick })} />;
                })}
              </section>
            ))}
            <button className="btn block" onClick={() => goTo('courses')}>
              <Icon name="cart" size={18} /> Voir la liste de courses
            </button>
          </div>
        </>
      ) : (
        <PrepView onOpen={(id) => setOpen({ id })} />
      )}

      {open && <MealSheet id={open.id} startPicking={open.pick} onClose={() => setOpen(null)} />}
      {weekSheet && <WeekSheet onClose={() => setWeekSheet(false)} />}
    </div>
  );
}

/** Un repas : toucher = recette, balayer = vider / autre idée, appui long = menu. */
function SlotRow({ id, onOpen }: { id: SlotId; onOpen: (pick?: boolean) => void }) {
  const { state, dispatch } = useStore();
  const dialog = useDialog();
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
  const meal = id.endsWith('dejeuner') ? 'dejeuner' : 'diner';

  /** Une autre recette pour ce seul repas (en évitant celle qu'on retire). */
  const reroll = () => {
    const cleared = { ...plan, slots: { ...plan.slots, [id]: withRecipe(slot, null) } };
    const learning = { ratings: state.ratings, recentWeeks: state.history.map((h) => h.recipeIds), stockUrgency: stockUrgencyMap(state.inventory, catalog, todayIso()) };
    const next = suggestPlan(catalog, cleared, state.profiles, state.settings, state.favorites, {
      seed: Math.floor(Math.random() * 1e9),
      onlyEmpty: true,
      only: id,
      avoid: rid ? [rid] : [],
      learning,
    });
    dispatch({ type: 'setRecipe', slot: id, recipeId: next.slots[id].recipeId });
  };
  const clear = () => dispatch({ type: 'clearSlot', slot: id });

  const menu = async () => {
    const choice = await dialog.actions({
      title: slotLabel(plan, id),
      message: recipe?.name,
      actions: [
        ...(recipe ? [{ id: 'voir', label: 'Voir la recette' }] : []),
        { id: 'changer', label: recipe ? 'Choisir un autre plat' : 'Choisir un plat' },
        { id: 'idee', label: recipe ? 'Autre idée au hasard' : 'Proposer un plat' },
        ...(recipe || slot.leftoverOf ? [{ id: 'vider', label: 'Vider ce repas', destructive: true }] : []),
      ],
    });
    if (choice === 'voir') onOpen();
    if (choice === 'changer') onOpen(true);
    if (choice === 'idee') reroll();
    if (choice === 'vider') clear();
  };
  const press = useLongPress(menu);

  return (
    <SwipeRow
      leading={[{ label: recipe ? 'Autre idée' : 'Proposer', icon: 'sparkles', color: '#2f80ed', onAction: reroll }]}
      trailing={recipe || slot.leftoverOf ? [{ label: 'Vider', icon: 'trash', color: '#e0352b', onAction: clear }] : []}
    >
    <button className={`slot ${recipe ? '' : 'slot-empty'}`} onClick={() => onOpen()} {...press}>
      <span className="slot-thumb" aria-hidden>
        {recipe?.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" /> : recipe ? CATEGORY_EMOJI[recipe.category] ?? '🍽️' : <Icon name="plus" size={20} />}
      </span>
      <span className="slot-main">
        <span className="slot-meal">{MEAL_LABELS[meal]}</span>
        <span className="slot-title">{recipe ? recipe.name : present.length === 0 ? 'Personne à table' : 'Choisir un plat'}</span>
        {(recipe || present.length < 2 || slot.note) && (
          <span className="slot-sub">
            {present.length === 1 && <span className="badge">{state.profiles[present[0]].name} seul·e</span>}
            {slot.leftoverOf && <span className="badge info">♻️ restes de {slotLabel(plan, slot.leftoverOf).toLowerCase()}</span>}
            {targets.length > 0 && <span className="badge info">+ restes ×{targets.length}</span>}
            {slot.extraPortions > 0 && !slot.leftoverOf && <span className="badge info">+{slot.extraPortions} portion(s)</span>}
            <FreshnessBadge check={fresh} />
            {savesStock.length > 0 && <span className="badge ok-badge">🧊 {savesStock.slice(0, 2).join(', ')}</span>}
            {slot.cookedOn && <span className="badge ok-badge">✓ cuisiné</span>}
            {recipe && state.ratings[recipe.id] === 1 && <span className="badge">👍</span>}
            {slot.note && <span className="badge">{slot.note}</span>}
          </span>
        )}
      </span>
      <Icon name="chevron" size={18} className="chevron" />
    </button>
    </SwipeRow>
  );
}

/** Dates, durée du planning et nouvelle semaine. */
function WeekSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const plan = state.plan;
  const s = state.settings;
  // Enchaîne sur le planning en cours : dimanche → dimanche, le dernier dimanche ouvre la semaine suivante.
  const lastDay = addDays(plan.weekOf, plan.days - 1);
  const nextStart = lastDay >= todayIso() ? upcomingWeekday(s.startWeekday, new Date(lastDay + 'T12:00:00')) : upcomingWeekday(s.startWeekday);

  const dialog = useDialog();
  const setDays = async (days: number) => {
    const lost = slotIds(plan).filter((id) => Number(id.split('-')[0].slice(1)) >= days && effectiveRecipeId(plan, id)).length;
    if (lost > 0 && !(await dialog.confirm({ title: `Raccourcir à ${days} jour${days > 1 ? 's' : ''} ?`, message: `${lost} repas prévu(s) sur les jours retirés seront supprimés.`, confirmLabel: 'Raccourcir', destructive: true })))
      return;
    dispatch({ type: 'setPlanDays', days });
  };

  return (
    <Sheet title="Dates et durée" onClose={onClose}>
      <section className="card">
        <label className="field">
          <span>Premier jour</span>
          <input type="date" value={plan.weekOf} onChange={(e) => e.target.value && dispatch({ type: 'setWeekOf', weekOf: e.target.value })} />
        </label>
        <div className="field-inline">
          <span>Nombre de jours</span>
          <Stepper value={plan.days} min={1} max={MAX_DAYS} onChange={setDays} format={(v) => `${v} j`} />
        </div>
        <div className="chips">
          {[
            { d: 5, l: '5 jours' },
            { d: 7, l: '7 jours' },
            { d: 8, l: 'Dim → dim' },
            { d: 14, l: '2 semaines' },
          ].map((o) => (
            <Chip key={o.d} active={plan.days === o.d} onClick={() => setDays(o.d)}>
              {o.l}
            </Chip>
          ))}
        </div>
        <p className="muted small">{planRange(plan)}</p>
      </section>

      <section className="card">
        <h3>Nouvelle semaine</h3>
        <p className="small muted">
          Vide le planning et les cases cochées (placard, frigo, notes et réglages conservés). La semaine terminée sert à varier les prochaines suggestions.
        </p>
        <p className="small">
          Prochain départ : <strong>{new Date(nextStart + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>, {s.planDays} jours
          ({WEEKDAY_LABELS[s.startWeekday].toLowerCase()} par défaut, modifiable dans Réglages › Semaine).
        </p>
        <button
          className="btn primary block"
          onClick={async () => {
            if (!(await dialog.confirm({ title: 'Nouvelle semaine ?', message: 'Le planning actuel sera vidé.', confirmLabel: 'Commencer la nouvelle semaine', destructive: true }))) return;
            dispatch({ type: 'newWeek', weekOf: nextStart, days: s.planDays });
            onClose();
          }}
        >
          Commencer la nouvelle semaine
        </button>
      </section>
    </Sheet>
  );
}

/** Vue batch cooking : ce qu'il faut cuisiner chaque jour de préparation, quantités totales comprises. */
function PrepView({ onOpen }: { onOpen: (id: SlotId) => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const dialog = useDialog();
  const plan = state.plan;
  const [session, setSession] = useState<Day | null>(null);

  const groups = useMemo(() => {
    return dayIds(plan)
      .map((d) => {
        const items = slotIds(plan)
          .filter((id) => plan.slots[id].prepDay === d)
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
      })
      .filter((g) => g.items.length > 0);
  }, [plan, state.profiles, catalog]);

  if (groups.length === 0)
    return (
      <Empty icon="pot" title="Rien à cuisiner pour l’instant">
        Choisissez des repas : Popote regroupe ici ce qu’il faut préparer à chaque session, quantités totales comprises.
      </Empty>
    );

  return (
    <div className="stack">
      {session && <BatchSession day={session} onClose={() => setSession(null)} />}
      <p className="muted small">
        Quantités crues totales, restes réservés et portions en plus compris. Refroidissez vite (moins de 2 h), répartissez en boîtes et étiquetez avec le jour.
      </p>
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="day-title">
            Session du {dayName(plan, g.day).toLowerCase()} <span className="muted">{dayDate(plan, g.day)}</span>
          </h2>
          <button className="session-card" onClick={() => setSession(g.day)}>
            <span className="tile-icon row-icon">
              <Icon name="clock" size={18} />
            </span>
            <span>
              <b>Plan minuté de la session</b>
              <span className="small">
                ≈ {formatDuration(batchPlan(catalog, plan, state.profiles, g.day, state.equipment).total)} · ordre de lancement, minuteurs, étiquettes
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
          {g.items.map((it) => {
            const r = catalog.recipes[it.recipeId];
            const cooked = plan.slots[it.sourceSlot].cookedOn;
            return (
              <article key={it.sourceSlot} className="card">
                <button className="linkish" onClick={() => onOpen(it.sourceSlot)}>
                  <h3>
                    {CATEGORY_EMOJI[r.category] ?? '🍽️'} {r.name}
                  </h3>
                </button>
                <p className="muted small">
                  {it.servings} repas · pour {it.servedSlots.map((s) => slotLabel(plan, s).toLowerCase()).join(', ')}
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
                    <p className="label">Accompagnements</p>
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
                {cooked ? (
                  <p className="note ok">✓ Cuisiné le {new Date(cooked + 'T12:00:00').toLocaleDateString('fr-FR')} : stock du frigo mis à jour.</p>
                ) : (
                  <button
                    className="btn block"
                    onClick={async () => {
                      if (
                        !(await dialog.confirm({
                          title: 'C’est cuisiné ?',
                          message: 'Les quantités utilisées (plat et accompagnements) seront retirées du stock du frigo.',
                          confirmLabel: 'Marquer comme cuisiné',
                        }))
                      )
                        return;
                      dispatch({ type: 'markCooked', slot: it.sourceSlot, lines: [...it.lines, ...it.sideLines], date: todayIso() });
                    }}
                  >
                    <Icon name="check" size={18} /> C’est cuisiné
                  </button>
                )}
                {it.checks
                  .filter((c) => c.f && c.f.status !== 'ok')
                  .map((c) => (
                    <p key={c.s} className={`note ${c.f!.status}`}>
                      <strong>{slotLabel(plan, c.s)} :</strong> {c.f!.message}
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
