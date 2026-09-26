import { useState } from 'react';
import type { ProfileId, Recipe, RecipeIngredient, SlotId } from '../domain/types';
import { recipeAllergens } from '../data/catalog';
import { ALLERGEN_LABELS } from '../data/aisles';
import { scaledQty } from '../domain/portions';
import { formatQty, toIngredientUnit } from '../domain/units';
import { PROFILE_IDS, effectiveRecipeId, slotIds, slotLabel } from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { CATEGORY_EMOJI, COST_LABEL, nfr } from './common';
import { Icon } from './icons';
import { adviceFor } from '../domain/equipment';
import { NUTRITION_SOURCE, portionNutrition } from '../domain/nutrition';

export function RecipeDetail({
  recipeId,
  recipe: given,
  onPick,
  hidePlanning,
  hideTitle,
}: {
  recipeId?: string;
  /** Recette non enregistrée (idée vide-frigo) à afficher. */
  recipe?: Recipe;
  onPick?: () => void;
  hidePlanning?: boolean;
  /** Le titre est déjà affiché au-dessus (fiche repas). */
  hideTitle?: boolean;
}) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const recipe = given ?? (recipeId ? catalog.recipes[recipeId] : undefined);
  const [target, setTarget] = useState<SlotId | ''>('');
  const [added, setAdded] = useState<string | null>(null);
  if (!recipe) return <p>Recette introuvable.</p>;
  const allergens = recipeAllergens(recipe);
  const advice = adviceFor(recipe, state.equipment, 2);
  const fav = state.favorites.includes(recipe.id);
  const rating = state.ratings[recipe.id];
  const inCatalog = !!catalog.recipes[recipe.id];
  const qtyFor = (ri: RecipeIngredient, p: ProfileId) => scaledQty(ri, state.profiles[p].factors, 1);
  const fmt = (ri: RecipeIngredient, qty: number) => {
    const ing = catalog.ingredients[ri.ingredientId];
    const v = toIngredientUnit(qty, ri.unit, ing);
    return v === null ? `${qty} ${ri.unit}` : formatQty(v, ing.unit, ing.pieceLabel);
  };
  const nutrition = state.settings.showNutrition ? PROFILE_IDS.map((p) => ({ p, n: portionNutrition(recipe, state.profiles[p].factors, catalog) })) : [];

  return (
    <div className="recipe-detail">
      {!hideTitle && (
        <div className="row gap align-center">
          <span className="hero-emoji" aria-hidden>
            {CATEGORY_EMOJI[recipe.category] ?? '🍽️'}
          </span>
          <h2 style={{ margin: 0 }}>{recipe.name}</h2>
        </div>
      )}
      {recipe.imageUrl && <img className="recipe-photo" src={recipe.imageUrl} alt="" loading="lazy" />}
      <p>{recipe.summary}</p>

      <div className="stats">
        <div className="stat">
          <b>{recipe.activeMin} min</b>
          <span>actives</span>
        </div>
        <div className="stat">
          <b>{recipe.totalMin} min</b>
          <span>au total</span>
        </div>
        <div className="stat">
          <b>{COST_LABEL[recipe.costLevel]}</b>
          <span>{recipe.temperature === 'froid' ? 'se mange froid' : recipe.temperature === 'chaud' ? 'se mange chaud' : 'chaud ou froid'}</span>
        </div>
      </div>

      <div className="chips">
        {onPick && (
          <button className="btn primary" onClick={onPick}>
            <Icon name="check" size={18} /> Choisir ce plat
          </button>
        )}
        <button className={fav ? 'chip active' : 'chip'} onClick={() => dispatch({ type: 'toggleFavorite', recipeId: recipe.id })} aria-pressed={fav}>
          {fav ? '★ Favori' : '☆ Favori'}
        </button>
        {inCatalog && (
          <>
            <button className={rating === 1 ? 'chip active' : 'chip'} aria-pressed={rating === 1} onClick={() => dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === 1 ? 0 : 1 })}>
              👍 On aime
            </button>
            <button className={rating === -1 ? 'chip active' : 'chip'} aria-pressed={rating === -1} onClick={() => dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === -1 ? 0 : -1 })}>
              👎 Plus jamais
            </button>
          </>
        )}
      </div>

      <h3>Ingrédients · 1 portion chacun</h3>
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
      <p className="muted small">Quantités crues, ajustées au profil de chacun (Réglages › Foyer).</p>

      {recipe.suggestedSides.length > 0 && (
        <p className="small">
          <strong>Accompagnements conseillés :</strong> {recipe.suggestedSides.map((s) => catalog.sides[s].name).join(', ')}.
        </p>
      )}

      {nutrition.length > 0 && (
        <details className="fold">
          <summary>Repères nutritionnels (indicatifs)</summary>
          <table className="qty-table">
            <thead>
              <tr>
                <th>Par portion, sans accompagnement</th>
                {nutrition.map(({ p }) => (
                  <th key={p}>{state.profiles[p].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Énergie', 'kcal', 'kcal', 0],
                  ['Protéines', 'proteines', 'g', 0],
                  ['Glucides', 'glucides', 'g', 0],
                  ['Lipides', 'lipides', 'g', 0],
                  ['Fibres', 'fibres', 'g', 0],
                  ['Sel', 'sel', 'g', 1],
                ] as const
              ).map(([label, key, unit, digits]) => (
                <tr key={key}>
                  <td>{label}</td>
                  {nutrition.map(({ p, n }) => (
                    <td key={p}>
                      ≈ {nfr(n[key], digits)} {unit}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Estimation à partir des ingrédients crus de la{' '}
            <a href={NUTRITION_SOURCE.url} target="_blank" rel="noreferrer">
              table Ciqual (Anses)
            </a>
            , hors huile de cuisson absorbée et accompagnement. Un repère, pas un objectif : les besoins dépendent de chacun.
            {nutrition[0].n.missing.length > 0 && ` Non comptés : ${nutrition[0].n.missing.join(', ').toLowerCase()}.`}
          </p>
        </details>
      )}

      {advice.length > 0 && (
        <div className="card">
          <h3>Avec votre équipement</h3>
          {advice.map((a) => (
            <div key={a.equipmentId}>
              <p className="small">
                <strong>{a.title}</strong>
              </p>
              <ul className="plain small">
                {a.lines.map((l, i) => (
                  <li key={i}>• {l}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="muted small">Équivalences indicatives : la notice de l’appareil prime.</p>
        </div>
      )}

      <h3>Étapes</h3>
      <ol className="steps">
        {recipe.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <div className="chips">
        {recipe.videoUrl && (
          <a className="btn primary small" href={recipe.videoUrl} target="_blank" rel="noreferrer">
            <Icon name="play" size={16} /> Vidéo
          </a>
        )}
        <a className="btn small" href={youtubeSearchUrl(recipe.name)} target="_blank" rel="noreferrer">
          <Icon name="play" size={16} /> Vidéos YouTube
        </a>
        {recipe.source && (
          <a className="btn small" href={recipe.source.url} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> {recipe.source.name}
          </a>
        )}
      </div>

      <details className="fold">
        <summary>Conservation, transport, allergènes</summary>
        <p className="small">
          {recipe.storageTips}{' '}
          <span className="muted">
            (repère : {recipe.fridgeDays} j au réfrigérateur{recipe.freezable ? ', congelable' : ', ne se congèle pas bien'})
          </span>
        </p>
        {recipe.transportTips && <p className="small">{recipe.transportTips}</p>}
        <p className="small">
          <strong>Allergènes :</strong> {allergens.length ? allergens.map((a) => ALLERGEN_LABELS[a]).join(', ') : 'aucun des 14 allergènes majeurs dans les ingrédients listés'}.
          <span className="muted"> Vérifiez toujours les étiquettes.</span>
        </p>
      </details>

      {!onPick && !hidePlanning && inCatalog && (
        <div className="card">
          <h3>Ajouter à la semaine</h3>
          <select value={target} onChange={(e) => setTarget(e.target.value as SlotId)}>
            <option value="">Choisir un repas…</option>
            {slotIds(state.plan).map((id) => {
              const cur = effectiveRecipeId(state.plan, id);
              return (
                <option key={id} value={id}>
                  {slotLabel(state.plan, id)} {cur ? `— remplace : ${catalog.recipes[cur]?.name ?? ''}` : '— libre'}
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
              setAdded(slotLabel(state.plan, target));
              setTarget('');
            }}
          >
            Ajouter
          </button>
          {added && <p className="note ok">✓ Ajouté : {added.toLowerCase()}.</p>}
        </div>
      )}
    </div>
  );
}

/** Recherche YouTube de la recette : toujours valable, sans clé d'API ni lien qui pourrait disparaître. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`recette ${name.replace(/\s*\(.*?\)/g, '')}`)}`;
}
