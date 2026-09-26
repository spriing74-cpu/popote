import { useState } from 'react';
import type { Recipe, SlotId } from '../domain/types';
import { recipeFitsSlot } from '../domain/planner';
import { MEALS, MEAL_LABELS, dateOf, dayDate, dayIds, dayName, effectiveRecipeId, slotId, slotLabel } from '../domain/week';
import { todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { Sheet } from './common';
import { useDialog } from './dialog';
import { haptic } from './ios';

/** Choisir le repas de la semaine où placer une recette : une grille jours × midi / soir. */
export function AddToWeek({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const dialog = useDialog();
  const plan = state.plan;
  const today = todayIso();
  const [done, setDone] = useState<string | null>(null);

  const place = async (id: SlotId) => {
    const cur = effectiveRecipeId(plan, id);
    if (cur && cur !== recipe.id) {
      const ok = await dialog.confirm({
        title: `Remplacer ${catalog.recipes[cur]?.name ?? 'ce plat'} ?`,
        message: slotLabel(plan, id),
        confirmLabel: 'Remplacer',
        destructive: true,
      });
      if (!ok) return;
    }
    haptic('medium');
    dispatch({ type: 'setRecipe', slot: id, recipeId: recipe.id });
    setDone(slotLabel(plan, id));
    window.setTimeout(onClose, 700);
  };

  return (
    <Sheet title="Ajouter à la semaine" onClose={onClose}>
      <p className="small muted">
        <strong>{recipe.name}</strong> — touchez un repas. ⚠️ : ne se transporte pas en boîte froide ce jour-là.
      </p>
      {done && <p className="note ok">✓ Ajouté : {done.toLowerCase()}</p>}
      <div className="week-grid">
        {dayIds(plan)
          .filter((d) => dateOf(plan, d) >= today || dayIds(plan).every((x) => dateOf(plan, x) < today))
          .map((d) => (
            <div key={d} className="week-grid-row">
              <span className="week-grid-day">
                <b>{dayName(plan, d)}</b>
                <span className="muted small">{dayDate(plan, d)}</span>
              </span>
              {MEALS.map((m) => {
                const id = slotId(d, m);
                const cur = effectiveRecipeId(plan, id);
                const fits = recipeFitsSlot(recipe, plan, id, state.profiles);
                const same = cur === recipe.id;
                return (
                  <button key={m} className={`week-cell ${cur ? 'taken' : 'free'} ${same ? 'same' : ''}`} onClick={() => place(id)}>
                    <span className="label">
                      {MEAL_LABELS[m]} {!fits && '⚠️'}
                    </span>
                    <span className="week-cell-name">{same ? '✓ déjà prévu' : cur ? catalog.recipes[cur]?.name : 'Libre'}</span>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </Sheet>
  );
}
