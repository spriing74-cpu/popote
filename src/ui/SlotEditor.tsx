import { useState } from 'react';
import type { Day, ProfileId, SlotId } from '../domain/types';
import { ACCOMPAGNEMENTS, COMPLEMENTS } from '../data/sides';
import { checkFreshness } from '../domain/freshness';
import { slotConstraint } from '../domain/planner';
import { PROFILE_IDS, dayDate, dayIds, dayIndex, dayName, effectiveRecipeId, leftoverTargets, parseSlotId, slotIds, slotIndex, slotLabel } from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { Chip, FreshnessBadge, Sheet, Stepper, Toggle, portionLabel } from './common';
import { RecipesScreen } from './RecipesScreen';

const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function SlotEditor({ id, onClose }: { id: SlotId; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [picking, setPicking] = useState(false);
  const plan = state.plan;
  const slot = plan.slots[id];
  const { day } = parseSlotId(id);
  const recipeId = effectiveRecipeId(plan, id);
  const recipe = recipeId ? catalog.recipes[recipeId] : null;
  const freshness = checkFreshness(catalog, plan, id);
  const constraint = slotConstraint(plan, id, state.profiles);
  const targets = leftoverTargets(plan, id);

  // Sources possibles de restes : créneaux antérieurs cuisinés (pas eux-mêmes des restes).
  const sources = slotIds(plan).filter((s) => slotIndex(s) < slotIndex(id) && plan.slots[s].recipeId && !plan.slots[s].leftoverOf);
  // Cibles possibles : créneaux postérieurs.
  const laterSlots = slotIds(plan).filter((s) => slotIndex(s) > slotIndex(id));

  const setDiner = (p: ProfileId, patch: Partial<(typeof slot.diners)[ProfileId]>) => dispatch({ type: 'setDiner', slot: id, profile: p, patch });

  const sideOptions = [
    ...(recipe?.suggestedSides ?? []).map((s) => catalog.sides[s]),
    ...ACCOMPAGNEMENTS.filter((s) => !recipe?.suggestedSides.includes(s.id)),
  ];

  return (
    <Sheet title={`Réglages — ${slotLabel(plan, id)}`} onClose={onClose}>
      <section className="card">
        <h3>Plat</h3>
        {slot.leftoverOf && <p className="note info">♻️ Restes de {slotLabel(plan, slot.leftoverOf).toLowerCase()} : aucun achat supplémentaire pour le plat, la quantité est ajoutée à la cuisson d’origine.</p>}
        {recipe ? (
          <p>
            <strong>{recipe.name}</strong>
          </p>
        ) : (
          <p className="muted">Aucun plat choisi.</p>
        )}
        {constraint === 'boite_froide' && recipe?.temperature === 'chaud' && (
          <p className="note trop_long">⚠️ Plat à réchauffer, mais pas de micro-ondes indiqué pour ce déjeuner.</p>
        )}
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => setPicking(true)}>
            {recipe && !slot.leftoverOf ? 'Changer de recette' : 'Choisir une recette'}
          </button>
          {(recipe || slot.leftoverOf) && (
            <button className="btn" onClick={() => dispatch({ type: 'clearSlot', slot: id })}>
              Vider
            </button>
          )}
        </div>
        {sources.length > 0 && (
          <label className="field">
            <span>Ou manger des restes de…</span>
            <select value={slot.leftoverOf ?? ''} onChange={(e) => dispatch({ type: 'setLeftover', slot: id, source: (e.target.value || null) as SlotId | null })}>
              <option value="">— pas de restes —</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(plan, s)} : {catalog.recipes[plan.slots[s].recipeId!]?.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="card">
        <h3>Qui mange ?</h3>
        {PROFILE_IDS.map((p) => {
          const d = slot.diners[p];
          const prof = state.profiles[p];
          return (
            <div key={p} className="diner">
              <Toggle checked={d.present} onChange={(v) => setDiner(p, { present: v })} label={<strong>{prof.name}</strong>} />
              {d.present && (
                <div className="diner-body">
                  <div className="field-inline">
                    <span>Portion</span>
                    <Stepper
                      value={d.portion}
                      min={PORTIONS[0]}
                      max={PORTIONS[PORTIONS.length - 1]}
                      step={0.25}
                      format={portionLabel}
                      onChange={(v) => setDiner(p, { portion: v })}
                    />
                  </div>
                  <label className="field">
                    <span>Accompagnement</span>
                    <select value={d.sideId ?? ''} onChange={(e) => setDiner(p, { sideId: e.target.value || null })}>
                      <option value="">Aucun</option>
                      {sideOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {recipe?.suggestedSides.includes(s.id) ? ' (conseillé)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field">
                    <span>Compléments / collation</span>
                    <div className="chips">
                      {COMPLEMENTS.map((c) => (
                        <Chip
                          key={c.id}
                          active={d.extras.includes(c.id)}
                          onClick={() => setDiner(p, { extras: d.extras.includes(c.id) ? d.extras.filter((x) => x !== c.id) : [...d.extras, c.id] })}
                        >
                          {c.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <p className="muted small">Une personne absente n’est jamais comptée dans les courses.</p>
      </section>

      {recipe && !slot.leftoverOf && (
        <section className="card">
          <h3>Préparation</h3>
          <label className="field">
            <span>Cuisiné le</span>
            <select value={slot.prepDay} onChange={(e) => dispatch({ type: 'setSlot', slot: id, patch: { prepDay: e.target.value as Day } })}>
              {dayIds(plan).filter((d) => dayIndex(d) <= dayIndex(day)).map((d) => (
                <option key={d} value={d}>
                  {dayName(plan, d)} {dayDate(plan, d)}
                  {d === day ? ' (le jour même)' : ''}
                </option>
              ))}
            </select>
          </label>
          <FreshnessBadge check={freshness} long />
          <div className="field-inline">
            <span>Portions en plus (congélateur, imprévu)</span>
            <Stepper value={slot.extraPortions} min={0} max={8} onChange={(v) => dispatch({ type: 'setSlot', slot: id, patch: { extraPortions: v } })} />
          </div>
          {laterSlots.length > 0 && (
            <div className="field">
              <span>Cuisiner en plus pour ces repas (restes réservés)</span>
              <div className="stack-tight">
                {laterSlots.map((t) => {
                  const other = plan.slots[t];
                  const otherRecipe = effectiveRecipeId(plan, t);
                  const checked = targets.includes(t);
                  return (
                    <label key={t} className="check-line">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          dispatch({
                            type: 'reserveLeftovers',
                            source: id,
                            targets: e.target.checked ? [...targets, t] : targets.filter((x) => x !== t),
                          })
                        }
                      />
                      <span>
                        {slotLabel(plan, t)}
                        {!checked && otherRecipe && <span className="muted"> — remplacera {catalog.recipes[otherRecipe]?.name}</span>}
                        {!checked && other.leftoverOf && <span className="muted"> (actuellement des restes)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="muted small">Les convives et portions de chaque repas réservé sont repris tels quels : rien n’est compté deux fois.</p>
            </div>
          )}
        </section>
      )}
      {slot.leftoverOf && <FreshnessBadge check={freshness} long />}

      <section className="card">
        <label className="field">
          <span>Note</span>
          <input type="text" value={slot.note} placeholder="ex. resto, invité…" onChange={(e) => dispatch({ type: 'setSlot', slot: id, patch: { note: e.target.value } })} />
        </label>
      </section>

      {picking && (
        <Sheet title={`Recette — ${slotLabel(plan, id)}`} onClose={() => setPicking(false)}>
          <RecipesScreen
            pickFor={id}
            onPick={(rid) => {
              dispatch({ type: 'setRecipe', slot: id, recipeId: rid });
              setPicking(false);
            }}
          />
        </Sheet>
      )}
    </Sheet>
  );
}
