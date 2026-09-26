import { useState } from 'react';
import type { SlotId } from '../domain/types';
import { checkFreshness } from '../domain/freshness';
import { effectiveRecipeId, leftoverTargets, presentProfiles, slotLabel } from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { FreshnessBadge, Sheet } from './common';
import { Icon } from './icons';
import { RecipeDetail } from './RecipeDetail';
import { RecipeArt } from './RecipeTiles';
import { RecipesScreen } from './RecipesScreen';
import { SlotEditor } from './SlotEditor';

/**
 * Toucher un repas du planning : la recette s'affiche directement.
 * Un créneau vide ouvre tout de suite le choix d'une recette.
 */
export function MealSheet({ id, onClose, startPicking }: { id: SlotId; onClose: () => void; startPicking?: boolean }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const plan = state.plan;
  const slot = plan.slots[id];
  const recipeId = effectiveRecipeId(plan, id);
  const recipe = recipeId ? catalog.recipes[recipeId] : null;
  const [picking, setPicking] = useState(!!startPicking || (!recipe && !slot?.leftoverOf));
  const [editing, setEditing] = useState(false);
  if (!slot) return null;
  const label = slotLabel(plan, id);
  const present = presentProfiles(slot);
  const targets = leftoverTargets(plan, id);
  const freshness = checkFreshness(catalog, plan, id);

  const picker = (
    <Sheet title={`Plat — ${label}`} onClose={() => (recipe ? setPicking(false) : onClose())}>
      <RecipesScreen
        pickFor={id}
        onPick={(rid) => {
          dispatch({ type: 'setRecipe', slot: id, recipeId: rid });
          setPicking(false);
        }}
      />
    </Sheet>
  );
  if (picking) return picker;

  return (
    <Sheet
      title={label}
      onClose={onClose}
      actions={
        <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Modifier le repas">
          <Icon name="pencil" size={20} />
        </button>
      }
    >
      {recipe ? (
        <>
          <section className="meal-hero">
            <div className="hero-top">
              <RecipeArt recipe={recipe} size="sm" />
              <div>
                <p className="label">{label}</p>
                <h2>{recipe.name}</h2>
                <p className="small muted">
                  {present.length === 2 ? 'À deux' : present.length === 1 ? `${state.profiles[present[0]].name} seul·e` : 'Personne à table'}
                  {slot.leftoverOf && ` · restes de ${slotLabel(plan, slot.leftoverOf).toLowerCase()}`}
                  {targets.length > 0 && ` · cuisiné aussi pour ${targets.length} autre(s) repas`}
                </p>
              </div>
            </div>
            <FreshnessBadge check={freshness} long />
            <div className="hero-actions">
              <button className="btn" onClick={() => setPicking(true)}>
                <Icon name="refresh" size={18} /> Changer
              </button>
              <button className="btn" onClick={() => setEditing(true)}>
                <Icon name="users" size={18} /> Réglages
              </button>
            </div>
          </section>
          <RecipeDetail recipeId={recipe.id} hidePlanning hideTitle />
        </>
      ) : (
        <section className="meal-hero">
          <p>{slot.leftoverOf ? 'Les restes prévus ne sont plus disponibles.' : 'Aucun plat choisi.'}</p>
          <button className="btn primary block" onClick={() => setPicking(true)}>
            Choisir un plat
          </button>
        </section>
      )}
      {editing && <SlotEditor id={id} onClose={() => setEditing(false)} />}
    </Sheet>
  );
}
