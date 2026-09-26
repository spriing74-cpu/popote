import { useMemo, useState } from 'react';
import type { Recipe } from '../domain/types';
import { recipeAllergens } from '../data/catalog';
import { ALLERGEN_LABELS } from '../data/aisles';
import { formatQty, toIngredientUnit } from '../domain/units';
import { PROFILE_IDS } from '../domain/week';
import { todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { COST_LABEL, Segmented, Stepper, categoryStyle, nfr, uid } from './common';
import { Icon } from './icons';
import { haptic } from './ios';
import { adviceFor } from '../domain/equipment';
import { NUTRITION_SOURCE, portionNutrition } from '../domain/nutrition';
import { ingredientStock, servingQty, similarRecipes, stepTimers, type Servings, type StockState } from '../domain/recipeTools';
import { RecipeTile } from './RecipeTiles';
import { AddToWeek } from './AddToWeek';
import { CookMode } from './CookMode';
import { useTimers } from './timers';
import { useDialog } from './dialog';

type Tab = 'ingredients' | 'etapes' | 'infos';

const STOCK_LABEL: Record<StockState, string> = { frigo: 'au frigo', placard: 'placard', manque: '' };

export function RecipeDetail({
  recipeId,
  recipe: given,
  onPick,
  hidePlanning,
  hideTitle,
  onOpenRecipe,
}: {
  recipeId?: string;
  /** Recette non enregistrée (idée vide-frigo) à afficher. */
  recipe?: Recipe;
  onPick?: () => void;
  hidePlanning?: boolean;
  /** Le titre est déjà affiché au-dessus (fiche repas). */
  hideTitle?: boolean;
  /** Ouvre une autre recette (« Dans le même esprit »). */
  onOpenRecipe?: (id: string) => void;
}) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const timers = useTimers();
  const dialog = useDialog();
  const recipe = given ?? (recipeId ? catalog.recipes[recipeId] : undefined);
  const [tab, setTab] = useState<Tab>('ingredients');
  const [servings, setServings] = useState<Servings>({ kind: 'foyer' });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [cooking, setCooking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedToList, setAddedToList] = useState<number | null>(null);
  const today = todayIso();
  const similar = useMemo(() => (recipe && onOpenRecipe ? similarRecipes(recipe, catalog) : []), [recipe, onOpenRecipe, catalog]);
  if (!recipe) return <p>Recette introuvable.</p>;

  const st = categoryStyle(recipe.category);
  const fav = state.favorites.includes(recipe.id);
  const rating = state.ratings[recipe.id];
  const inCatalog = !!catalog.recipes[recipe.id];
  const allergens = recipeAllergens(recipe);
  const advice = adviceFor(recipe, state.equipment, 2);

  const lines = recipe.ingredients.map((ri) => {
    const ing = catalog.ingredients[ri.ingredientId];
    const qty = servingQty(ri, servings, state.profiles);
    const base = toIngredientUnit(qty, ri.unit, ing);
    return {
      ri,
      ing,
      qty,
      base,
      text: base === null ? `${nfr(qty)} ${ri.unit}` : formatQty(base, ing.unit, ing.pieceLabel),
      stock: ingredientStock(ri, qty, catalog, state.inventory, state.pantry, today),
    };
  });
  const missing = lines.filter((l) => l.stock === 'manque');
  const haveCount = lines.length - missing.length;

  const addMissing = () => {
    const existing = new Set(state.manualItems.map((m) => m.label.toLowerCase()));
    let n = 0;
    for (const l of missing) {
      if (existing.has(l.ing.name.toLowerCase())) continue;
      dispatch({ type: 'addManualItem', item: { id: uid(), label: l.ing.name, quantity: l.text, aisle: l.ing.aisle } });
      n++;
    }
    haptic('medium');
    setAddedToList(n);
  };

  const toggle = (id: string) => {
    haptic('light');
    setChecked((c) => ({ ...c, [id]: !c[id] }));
  };

  const nutrition = state.settings.showNutrition ? PROFILE_IDS.map((p) => ({ p, n: portionNutrition(recipe, state.profiles[p].factors, catalog) })) : [];

  const ratingButtons = (
    <>
        <button className={fav ? 'icon-btn active' : 'icon-btn'} aria-pressed={fav} aria-label="Favori" onClick={() => (haptic('light'), dispatch({ type: 'toggleFavorite', recipeId: recipe.id }))}>
          <Icon name="star" size={20} />
        </button>
        {inCatalog && (
          <>
            <button
              className={rating === 1 ? 'icon-btn active' : 'icon-btn'}
              aria-pressed={rating === 1}
              aria-label="On aime"
              onClick={() => (haptic('light'), dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === 1 ? 0 : 1 }))}
            >
              <Icon name="thumbUp" size={20} />
            </button>
            <button
              className={rating === -1 ? 'icon-btn active danger' : 'icon-btn'}
              aria-pressed={rating === -1}
              aria-label="Plus jamais"
              onClick={() => (haptic('light'), dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === -1 ? 0 : -1 }))}
            >
              <Icon name="thumbDown" size={20} />
            </button>
          </>
        )}
    </>
  );

  return (
    <div className="recipe-detail">
      {!hideTitle && (
        <section className="recipe-hero" style={{ background: `linear-gradient(150deg, ${st.from}, ${st.to})` }}>
          {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" /> : <span className="hero-big-emoji" aria-hidden>{st.emoji}</span>}
          <span className="hero-cat">{st.label}</span>
          <span className="hero-rate">{ratingButtons}</span>
        </section>
      )}
      {!hideTitle && <h2 className="recipe-title">{recipe.name}</h2>}
      <p className="recipe-summary">{recipe.summary}</p>

      <div className="pill-row">
        <span className="pill">
          <Icon name="clock" size={14} /> {recipe.activeMin} min actives · {recipe.totalMin} min
        </span>
        <span className="pill">{COST_LABEL[recipe.costLevel]}</span>
        <span className="pill">{recipe.temperature === 'froid' ? '🧊 froid' : recipe.temperature === 'chaud' ? '🔥 chaud' : 'chaud ou froid'}</span>
        {recipe.freezable && <span className="pill">❄️ se congèle</span>}
        {recipe.vegetarian && <span className="pill">🌱 sans viande</span>}
      </div>

      <div className="recipe-actions">
        {onPick ? (
          <button className="btn primary" onClick={onPick}>
            <Icon name="check" size={18} /> Choisir ce plat
          </button>
        ) : (
          <button className="btn primary" onClick={() => setCooking(true)}>
            <Icon name="play" size={16} /> Cuisiner
          </button>
        )}
        {!onPick && !hidePlanning && inCatalog && (
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="calendar" size={18} /> À la semaine
          </button>
        )}
        {hideTitle && ratingButtons}
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'ingredients', label: 'Ingrédients' },
          { id: 'etapes', label: 'Étapes' },
          { id: 'infos', label: 'Infos' },
        ]}
      />

      {tab === 'ingredients' && (
        <section>
          <div className="chips">
            <button className={servings.kind === 'foyer' ? 'chip active' : 'chip'} onClick={() => setServings({ kind: 'foyer' })}>
              Nous deux
            </button>
            {PROFILE_IDS.map((p) => (
              <button key={p} className={servings.kind === 'profil' && servings.id === p ? 'chip active' : 'chip'} onClick={() => setServings({ kind: 'profil', id: p })}>
                {state.profiles[p].name}
              </button>
            ))}
            <button className={servings.kind === 'portions' ? 'chip active' : 'chip'} onClick={() => setServings({ kind: 'portions', n: servings.kind === 'portions' ? servings.n : 4 })}>
              Portions…
            </button>
          </div>
          {servings.kind === 'portions' && (
            <div className="field-inline">
              <span>Portions standard</span>
              <Stepper value={servings.n} min={1} max={12} onChange={(n) => setServings({ kind: 'portions', n })} />
            </div>
          )}
          <p className="small muted">
            {servings.kind === 'foyer'
              ? 'Une portion chacun, ajustée au profil de chacun.'
              : servings.kind === 'profil'
                ? `Une portion ajustée au profil de ${state.profiles[servings.id].name}.`
                : 'Portions adultes standard, sans ajustement.'}{' '}
            Quantités crues. Touchez un ingrédient pour le cocher.
          </p>

          <div className="have-bar">
            <div className="progress" aria-hidden>
              <span style={{ width: `${(haveCount / Math.max(1, lines.length)) * 100}%` }} />
            </div>
            <span className="small">
              <strong>{haveCount}</strong>/{lines.length} déjà à la maison
            </span>
          </div>

          <ul className="ing-list">
            {lines.map((l) => (
              <li key={l.ri.ingredientId}>
                <button className={checked[l.ri.ingredientId] ? 'ing-row done' : 'ing-row'} onClick={() => toggle(l.ri.ingredientId)} aria-pressed={!!checked[l.ri.ingredientId]}>
                  <span className="ing-check" aria-hidden>
                    {checked[l.ri.ingredientId] && <Icon name="check" size={14} />}
                  </span>
                  <span className="ing-name">
                    {l.ing.name}
                    {l.ri.form && <span className="muted"> · {l.ri.form}</span>}
                    {l.stock !== 'manque' && <span className={`stock-tag ${l.stock}`}>{STOCK_LABEL[l.stock]}</span>}
                  </span>
                  <span className="ing-qty">{l.text}</span>
                </button>
              </li>
            ))}
          </ul>

          {missing.length > 0 && inCatalog && (
            <button className="btn block" onClick={addMissing} disabled={addedToList !== null}>
              <Icon name="cart" size={18} />{' '}
              {addedToList === null ? `Ajouter les ${missing.length} manquants aux courses` : addedToList ? `✓ ${addedToList} article(s) ajouté(s) aux courses` : '✓ Déjà dans les courses'}
            </button>
          )}
          {recipe.suggestedSides.length > 0 && (
            <p className="small">
              <strong>Pour accompagner :</strong> {recipe.suggestedSides.map((s) => catalog.sides[s].name.toLowerCase()).join(', ')}.
            </p>
          )}
        </section>
      )}

      {tab === 'etapes' && (
        <section>
          <button className="btn primary block" onClick={() => setCooking(true)}>
            <Icon name="play" size={16} /> Mode cuisine : étape par étape, écran allumé
          </button>
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={i}>
                {s}
                {stepTimers(s).length > 0 && (
                  <span className="step-timers">
                    {stepTimers(s).map((t) => (
                      <button key={t.minutes} className="chip" onClick={() => timers.start(`${recipe.name} · ${t.label}`, t.minutes)}>
                        <Icon name="clock" size={14} /> {t.label}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="chips">
            {recipe.videoUrl && (
              <a className="btn small primary" href={recipe.videoUrl} target="_blank" rel="noreferrer">
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
        </section>
      )}

      {tab === 'infos' && (
        <section>
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
          {nutrition.length > 0 && (
            <div className="card">
              <h3>Repères nutritionnels</h3>
              <table className="qty-table">
                <thead>
                  <tr>
                    <th>1 portion, sans accompagnement</th>
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
                Estimation d’après la{' '}
                <a href={NUTRITION_SOURCE.url} target="_blank" rel="noreferrer">
                  table Ciqual (Anses)
                </a>
                , hors huile absorbée et accompagnement. Un repère, pas un objectif.
                {nutrition[0].n.missing.length > 0 && ` Non comptés : ${nutrition[0].n.missing.join(', ').toLowerCase()}.`}
              </p>
            </div>
          )}
          <div className="card">
            <h3>Conservation</h3>
            <p className="small">
              {recipe.storageTips} <span className="muted">(repère : {recipe.fridgeDays} j au réfrigérateur{recipe.freezable ? ', congelable' : ', ne se congèle pas bien'})</span>
            </p>
            {recipe.transportTips && (
              <>
                <h3>Transport</h3>
                <p className="small">{recipe.transportTips}</p>
              </>
            )}
            <h3>Allergènes</h3>
            <p className="small">
              {allergens.length ? allergens.map((a) => ALLERGEN_LABELS[a]).join(', ') : 'Aucun des 14 allergènes majeurs dans les ingrédients listés'}.{' '}
              <span className="muted">Vérifiez toujours les étiquettes.</span>
            </p>
          </div>
          {inCatalog && /^(vf|mdb|imp)-/.test(recipe.id) && (
            <button
              className="btn danger block"
              onClick={async () => {
                const used = Object.values(state.plan.slots).some((sl) => sl.recipeId === recipe.id);
                if (used) {
                  await dialog.actions({ title: 'Recette prévue cette semaine', message: 'Retirez-la d’abord du planning.', actions: [] });
                  return;
                }
                if (await dialog.confirm({ title: `Supprimer « ${recipe.name} » ?`, message: 'Elle disparaîtra de vos recettes.', confirmLabel: 'Supprimer', destructive: true }))
                  dispatch({ type: 'removeCustomRecipe', id: recipe.id });
              }}
            >
              <Icon name="trash" size={18} /> Supprimer cette recette
            </button>
          )}
        </section>
      )}

      {similar.length > 0 && onOpenRecipe && (
        <section className="shelf">
          <h2 className="shelf-title">Dans le même esprit</h2>
          <div className="shelf-row">
            {similar.map((r) => (
              <RecipeTile key={r.id} recipe={r} onOpen={() => onOpenRecipe(r.id)} />
            ))}
          </div>
        </section>
      )}

      {cooking && <CookMode recipe={recipe} servings={servings} onClose={() => setCooking(false)} />}
      {adding && <AddToWeek recipe={recipe} onClose={() => setAdding(false)} />}
    </div>
  );
}


/** Recherche YouTube de la recette : toujours valable, sans clé d'API ni lien qui pourrait disparaître. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`recette ${name.replace(/\s*\(.*?\)/g, '')}`)}`;
}
