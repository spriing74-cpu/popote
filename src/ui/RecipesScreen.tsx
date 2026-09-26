import { useMemo, useState, type ReactNode } from 'react';
import type { Recipe, SlotId } from '../domain/types';
import { recipeAllowed, recipeFitsSlot, slotConstraint } from '../domain/planner';
import { rankCatalog } from '../domain/antigaspi';
import { todayIso } from '../domain/inventory';
import { recipeShelves } from '../domain/recipeTools';
import { effectiveRecipeId, slotIds, slotLabel } from '../domain/week';
import { useCatalog, useStore } from '../state/store';
import { CATEGORY_STYLE, COST_LABEL, Chip, Empty, ScreenHeader, Sheet, categoryStyle } from './common';
import { RecipeArt, RecipeTile, useRecipeMenu } from './RecipeTiles';
import { Icon } from './icons';
import { RecipeDetail } from './RecipeDetail';
import { ExplorerScreen } from './ExplorerScreen';

type Filter = 'rapide' | 'boite' | 'vege' | 'eco' | 'congel' | 'favoris';
type Sort = 'pertinence' | 'rapide' | 'az';

const FILTERS: { id: Filter; label: string; test: (r: Recipe, fav: string[], ratings: Record<string, 1 | -1>) => boolean }[] = [
  { id: 'favoris', label: '★ Préférées', test: (r, fav, ratings) => fav.includes(r.id) || ratings[r.id] === 1 },
  { id: 'rapide', label: '⏱ ≤ 20 min', test: (r) => r.activeMin <= 20 },
  { id: 'boite', label: '🧊 Boîte froide', test: (r) => r.lunchbox && r.temperature !== 'chaud' },
  { id: 'vege', label: '🌱 Sans viande', test: (r) => !!r.vegetarian },
  { id: 'congel', label: '❄️ Se congèle', test: (r) => r.freezable },
  { id: 'eco', label: '€ Économique', test: (r) => r.costLevel === 1 },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Ligne de résultat (recherche, choix d'un plat). */
export function RecipeCard({ recipe, onOpen, action }: { recipe: Recipe; onOpen: () => void; action?: ReactNode }) {
  const { state } = useStore();
  const press = useRecipeMenu(recipe, onOpen);
  return (
    <article className="card recipe-card">
      <button className="recipe-card-main" onClick={onOpen} {...press}>
        <RecipeArt recipe={recipe} size="sm" />
        <span className="rc-body">
          <h3>
            {state.favorites.includes(recipe.id) && <span aria-label="favori">★ </span>}
            {state.ratings[recipe.id] === 1 && <span aria-label="aimée">👍 </span>}
            {state.ratings[recipe.id] === -1 && <span aria-label="écartée">👎 </span>}
            {recipe.name}
          </h3>
          <p className="rc-summary">{recipe.summary}</p>
          <span className="meta">
            <span>
              <Icon name="clock" size={14} /> {recipe.activeMin} min
            </span>
            <span>{COST_LABEL[recipe.costLevel]}</span>
            {recipe.lunchbox && recipe.temperature !== 'chaud' && <span>🧊 boîte</span>}
            {recipe.freezable && <span>❄️</span>}
            {recipe.vegetarian && <span>🌱</span>}
          </span>
        </span>
      </button>
      {action}
    </article>
  );
}

/**
 * Recettes. Accueil en rayons (frigo, préférées, rapides, à découvrir…) et envies par famille ;
 * dès qu'on cherche ou filtre, liste de résultats triable. En mode « choix » (depuis un repas),
 * liste directe des recettes adaptées au créneau.
 */
export function RecipesScreen({ pickFor, onPick }: { pickFor?: SlotId; onPick?: (id: string) => void }) {
  const { state } = useStore();
  const catalog = useCatalog();
  const [active, setActive] = useState<Filter[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('pertinence');
  const [onlyFitting, setOnlyFitting] = useState(true);
  const [onlyAllowed, setOnlyAllowed] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [explorer, setExplorer] = useState(false);
  const [shelfOpen, setShelfOpen] = useState<string | null>(null);
  const constraint = pickFor ? slotConstraint(state.plan, pickFor, state.profiles) : null;
  const today = todayIso();

  const fromFridge = useMemo(() => rankCatalog(catalog, state.inventory, today, state.settings, 12), [catalog, state.inventory, state.settings, today]);
  const shelves = useMemo(
    () =>
      recipeShelves(catalog, {
        favorites: state.favorites,
        ratings: state.ratings,
        history: state.history.map((h) => h.recipeIds),
        planned: slotIds(state.plan).map((id) => effectiveRecipeId(state.plan, id)).filter((x): x is string => !!x),
        fromFridge: fromFridge.map((r) => r.recipe),
        today,
        allowed: (r) => recipeAllowed(r, state.settings, catalog),
      }),
    [catalog, state.favorites, state.ratings, state.history, state.plan, state.settings, fromFridge, today],
  );

  const searching = !!pickFor || q.trim() !== '' || active.length > 0 || category !== null;

  const list = useMemo(() => {
    if (!searching) return [];
    const needle = norm(q.trim());
    const scored = Object.values(catalog.recipes)
      .filter((r) => {
        if (category && r.category !== category) return false;
        if (!active.every((f) => FILTERS.find((x) => x.id === f)!.test(r, state.favorites, state.ratings))) return false;
        if (onlyAllowed && !recipeAllowed(r, state.settings, catalog)) return false;
        if (onlyAllowed && state.ratings[r.id] === -1) return false;
        if (pickFor && onlyFitting && !recipeFitsSlot(r, state.plan, pickFor, state.profiles)) return false;
        return true;
      })
      .map((r) => {
        // Pertinence : le nom compte plus que la description ou les ingrédients.
        let s = 0;
        if (needle) {
          if (norm(r.name).includes(needle)) s += norm(r.name).startsWith(needle) ? 6 : 4;
          if (norm(r.summary).includes(needle)) s += 1;
          if (r.ingredients.some((ri) => norm(catalog.ingredients[ri.ingredientId]?.name ?? '').includes(needle))) s += 2;
          if (s === 0) return null;
        }
        if (state.favorites.includes(r.id)) s += 1.5;
        if (state.ratings[r.id] === 1) s += 1;
        return { r, s };
      })
      .filter((x): x is { r: Recipe; s: number } => x !== null);
    const by: Record<Sort, (a: (typeof scored)[number], b: (typeof scored)[number]) => number> = {
      pertinence: (a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name, 'fr'),
      rapide: (a, b) => a.r.activeMin - b.r.activeMin || a.r.totalMin - b.r.totalMin,
      az: (a, b) => a.r.name.localeCompare(b.r.name, 'fr'),
    };
    return scored.sort(by[sort]).map((x) => x.r);
  }, [searching, q, category, active, onlyFitting, onlyAllowed, pickFor, sort, state, catalog]);

  const toggle = (f: Filter) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]));
  const reset = () => {
    setQ('');
    setActive([]);
    setCategory(null);
  };
  const fridgeNote = (r: Recipe) => {
    const hit = fromFridge.find((x) => x.recipe.id === r.id);
    return hit ? `${hit.uses.length} au frigo` : undefined;
  };
  const shelf = shelves.find((s) => s.id === shelfOpen);

  return (
    <div className="screen">
      {!pickFor && <ScreenHeader title="Recettes" subtitle={`${Object.keys(catalog.recipes).length} recettes maison, disponibles hors ligne`} />}

      <div className="search-wrap sticky-search">
        <Icon name="search" size={18} />
        <input className="search" type="search" placeholder="Plat ou ingrédient : poulet, courgette…" value={q} onChange={(e) => setQ(e.target.value)} />
        {searching && !pickFor && (
          <button className="search-clear" onClick={reset} aria-label="Effacer la recherche">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <div className="chips scroll">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={active.includes(f.id)} onClick={() => toggle(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {!searching ? (
        <>
          <h2 className="shelf-title">Envies</h2>
          <div className="craving-grid">
            {Object.entries(CATEGORY_STYLE).map(([id, st]) => (
              <button key={id} className="craving" style={{ background: `linear-gradient(145deg, ${st.from}, ${st.to})` }} onClick={() => setCategory(id)}>
                <span className="craving-emoji" aria-hidden>
                  {st.emoji}
                </span>
                <span>{st.label}</span>
              </button>
            ))}
          </div>

          {shelves.map((s) => (
            <section key={s.id} className="shelf">
              <div className="shelf-head">
                <div>
                  <h2 className="shelf-title">{s.title}</h2>
                  {s.subtitle && <p className="shelf-sub">{s.subtitle}</p>}
                </div>
                {s.recipes.length > 4 && (
                  <button className="btn-link" onClick={() => setShelfOpen(s.id)}>
                    Tout voir
                  </button>
                )}
              </div>
              <div className="shelf-row">
                {s.recipes.map((r) => (
                  <RecipeTile key={r.id} recipe={r} onOpen={() => setOpen(r.id)} note={s.id === 'frigo' ? fridgeNote(r) : undefined} />
                ))}
              </div>
            </section>
          ))}

          <button className="explore-card" onClick={() => setExplorer(true)}>
            <span className="explore-emoji" aria-hidden>
              🌍
            </span>
            <span>
              <b>Recettes du monde en ligne</b>
              <span className="small">≈ 800 recettes avec vidéo, à importer dans Popote</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        </>
      ) : (
        <>
          {category && (
            <div className="chips">
              <Chip active onClick={() => setCategory(null)}>
                {categoryStyle(category).emoji} {categoryStyle(category).label} ✕
              </Chip>
            </div>
          )}
          {pickFor && constraint !== 'aucune' && (
            <label className="check-line small">
              <input type="checkbox" checked={onlyFitting} onChange={(e) => setOnlyFitting(e.target.checked)} />
              {constraint === 'boite_froide' ? 'Boîte mangeable froide' : 'Boîte transportable'} ({slotLabel(state.plan, pickFor).toLowerCase()} au travail)
            </label>
          )}
          <div className="row space-between">
            <p className="label">
              {list.length} recette{list.length > 1 ? 's' : ''}
            </p>
            <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
              <option value="pertinence">Pertinence</option>
              <option value="rapide">Plus rapides</option>
              <option value="az">De A à Z</option>
            </select>
          </div>
          <div className="stack">
            {list.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onOpen={() => setOpen(r.id)}
                action={
                  onPick ? (
                    <button className="btn block" onClick={() => onPick(r.id)}>
                      <Icon name="check" size={18} /> Choisir
                    </button>
                  ) : undefined
                }
              />
            ))}
            {list.length === 0 && (
              <Empty icon="search" title="Aucune recette">
                Retirez un filtre{!pickFor && ' ou cherchez dans les recettes du monde en ligne'}.
                {!pickFor && (
                  <button className="btn block" onClick={() => setExplorer(true)}>
                    🌍 Chercher en ligne
                  </button>
                )}
              </Empty>
            )}
          </div>
          <label className="check-line small">
            <input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />
            Respecter mes exclusions et les « plus jamais »
          </label>
        </>
      )}

      {shelf && (
        <Sheet title={shelf.title} onClose={() => setShelfOpen(null)}>
          <div className="tile-grid">
            {shelf.recipes.map((r) => (
              <RecipeTile key={r.id} recipe={r} onOpen={() => setOpen(r.id)} note={shelf.id === 'frigo' ? fridgeNote(r) : undefined} />
            ))}
          </div>
        </Sheet>
      )}
      {explorer && (
        <Sheet title="Recettes du monde" onClose={() => setExplorer(false)}>
          <ExplorerScreen />
        </Sheet>
      )}
      {open && (
        <Sheet title={catalog.recipes[open]?.name ?? 'Recette'} onClose={() => setOpen(null)}>
          <RecipeDetail recipeId={open} onPick={onPick ? () => onPick(open) : undefined} onOpenRecipe={setOpen} />
        </Sheet>
      )}
    </div>
  );
}

