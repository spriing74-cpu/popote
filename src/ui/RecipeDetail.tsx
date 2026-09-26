import { useState } from 'react';
import type { ProfileId, Recipe, RecipeIngredient, SlotId } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { recipeAllergens } from '../data/catalog';
import { ALLERGEN_LABELS } from '../data/aisles';
import { scaledQty } from '../domain/portions';
import { formatQty, toIngredientUnit } from '../domain/units';
import { PROFILE_IDS, SLOT_IDS, effectiveRecipeId, slotLabel } from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { COST_LABEL } from './common';

function fmt(ri: RecipeIngredient, qty: number): string {
  const ing = INGREDIENTS[ri.ingredientId];
  const v = toIngredientUnit(qty, ri.unit, ing);
  return v === null ? `${qty} ${ri.unit}` : formatQty(v, ing.unit, ing.pieceLabel);
}

export function RecipeDetail({
  recipeId,
  recipe: given,
  onPick,
  hidePlanning,
}: {
  recipeId?: string;
  /** Recette non enregistrée (idée vide-frigo) à afficher. */
  recipe?: Recipe;
  onPick?: () => void;
  hidePlanning?: boolean;
}) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const recipe = given ?? (recipeId ? catalog.recipes[recipeId] : undefined);
  const [target, setTarget] = useState<SlotId | ''>('');
  const [added, setAdded] = useState<string | null>(null);
  if (!recipe) return <p>Recette introuvable.</p>;
  const allergens = recipeAllergens(recipe);
  const fav = state.favorites.includes(recipe.id);
  const qtyFor = (ri: RecipeIngredient, p: ProfileId) => scaledQty(ri, state.profiles[p].factors, 1);

  return (
    <div className="recipe-detail">
      <h2>{recipe.name}</h2>
      {recipe.imageUrl && <img className="recipe-photo" src={recipe.imageUrl} alt="" loading="lazy" />}
      <p>{recipe.summary}</p>
      <div className="row gap wrap">
        {recipe.videoUrl && (
          <a className="btn primary" href={recipe.videoUrl} target="_blank" rel="noreferrer">
            ▶ Voir la vidéo
          </a>
        )}
        <a className="btn" href={youtubeSearchUrl(recipe.name)} target="_blank" rel="noreferrer">
          ▶ Vidéos sur YouTube
        </a>
        {recipe.source && (
          <a className="btn" href={recipe.source.url} target="_blank" rel="noreferrer">
            Source : {recipe.source.name} ↗
          </a>
        )}
      </div>
      <p className="meta">
        <span>⏱ {recipe.activeMin} min actives</span>
        <span>{recipe.totalMin} min au total</span>
        <span>Coût relatif {COST_LABEL[recipe.costLevel]}</span>
        <span>{recipe.temperature === 'froid' ? 'Se mange froid' : recipe.temperature === 'chaud' ? 'Se mange chaud' : 'Chaud ou froid'}</span>
      </p>
      <div className="row gap">
        <button className="btn" onClick={() => dispatch({ type: 'toggleFavorite', recipeId: recipe.id })}>
          {fav ? '★ Favori' : '☆ Ajouter aux favoris'}
        </button>
        {onPick && (
          <button className="btn primary" onClick={onPick}>
            Choisir cette recette
          </button>
        )}
      </div>

      <h3>Ingrédients — 1 portion chacun</h3>
      <p className="muted small">Quantités crues, calculées avec les réglages de chaque profil. Accompagnement éventuel en plus.</p>
      <table className="qty-table">
        <thead>
          <tr>
            <th>Ingrédient</th>
            {PROFILE_IDS.map((p) => (
              <th key={p}>{state.profiles[p].name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((ri) => (
            <tr key={ri.ingredientId}>
              <td>
                {catalog.ingredients[ri.ingredientId].name}
                {ri.form && <span className="muted"> ({ri.form})</span>}
              </td>
              {PROFILE_IDS.map((p) => (
                <td key={p}>{fmt(ri, qtyFor(ri, p))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {recipe.suggestedSides.length > 0 && (
        <p>
          <strong>Accompagnements conseillés :</strong> {recipe.suggestedSides.map((s) => catalog.sides[s].name).join(', ')}.
          <span className="muted"> Chacun peut choisir le sien dans le planning.</span>
        </p>
      )}

      <h3>Étapes</h3>
      <ol className="steps">
        {recipe.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <h3>Conservation</h3>
      <p>
        {recipe.storageTips} <span className="muted">(repère : {recipe.fridgeDays} j au réfrigérateur{recipe.freezable ? ', congelable' : ', ne se congèle pas bien'})</span>
      </p>
      {recipe.transportTips && (
        <>
          <h3>Transport</h3>
          <p>{recipe.transportTips}</p>
        </>
      )}

      <h3>Allergènes connus</h3>
      <p>{allergens.length ? allergens.map((a) => ALLERGEN_LABELS[a]).join(', ') : 'Aucun des 14 allergènes majeurs dans les ingrédients listés.'}</p>
      <p className="muted small">Déduits des ingrédients génériques : vérifiez toujours les étiquettes des produits achetés.</p>

      {!onPick && !hidePlanning && (
        <div className="card">
          <h3>Ajouter au planning</h3>
          <select value={target} onChange={(e) => setTarget(e.target.value as SlotId)}>
            <option value="">Choisir un repas…</option>
            {SLOT_IDS.map((id) => {
              const cur = effectiveRecipeId(state.plan, id);
              return (
                <option key={id} value={id}>
                  {slotLabel(id)} {cur ? `— remplace : ${catalog.recipes[cur]?.name ?? ''}` : '— libre'}
                </option>
              );
            })}
          </select>
          <button
            className="btn primary block"
            disabled={!target}
            onClick={() => {
              if (!target) return;
              dispatch({ type: 'setRecipe', slot: target, recipeId: recipe.id });
              setAdded(slotLabel(target));
              setTarget('');
            }}
          >
            Ajouter
          </button>
          {added && <p className="note ok">✓ Ajouté à {added.toLowerCase()}.</p>}
        </div>
      )}
    </div>
  );
}

/** Recherche YouTube de la recette : toujours valable, sans clé d'API ni lien qui pourrait disparaître. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`recette ${name.replace(/\s*\(.*?\)/g, '')}`)}`;
}
