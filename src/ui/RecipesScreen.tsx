import { useMemo, useState, type ReactNode } from 'react';
import type { Recipe, SlotId } from '../domain/types';
import { recipeAllowed, recipeFitsSlot, slotConstraint } from '../domain/planner';
import { useCatalog, useStore } from '../state/store';
import { CATEGORY_EMOJI, COST_LABEL, Chip, Empty, ScreenHeader, Segmented, Sheet } from './common';
import { Icon } from './icons';
import { RecipeDetail } from './RecipeDetail';
import { ExplorerScreen } from './ExplorerScreen';
import { slotLabel } from '../domain/week';

type Filter = 'boite' | 'diner' | 'rapide' | 'eco' | 'restes' | 'vege' | 'favoris' | 'aimees';

const FILTERS: { id: Filter; label: string; test: (r: Recipe, fav: string[], ratings: Record<string, 1 | -1>) => boolean }[] = [
  { id: 'favoris', label: '★ Favoris', test: (r, fav) => fav.includes(r.id) },
  { id: 'aimees', label: '👍 On aime', test: (r, _f, ratings) => ratings[r.id] === 1 },
  { id: 'rapide', label: '⏱ ≤ 20 min', test: (r) => r.activeMin <= 20 },
  { id: 'boite', label: '🧊 Boîte froide', test: (r) => r.lunchbox && r.temperature !== 'chaud' },
  { id: 'diner', label: '🍲 Dîner', test: (r) => r.meals.includes('diner') },
  { id: 'vege', label: '🌱 Sans viande', test: (r) => !!r.vegetarian },
  { id: 'eco', label: '€ Économique', test: (r) => r.costLevel === 1 },
  { id: 'restes', label: '♻️ Idéal restes', test: (r) => r.leftoverFriendly },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function RecipeCard({ recipe, onOpen, action }: { recipe: Recipe; onOpen: () => void; action?: ReactNode }) {
  const { state } = useStore();
  return (
    <article className="card recipe-card">
      <button className="recipe-card-main" onClick={onOpen}>
        <span className="slot-thumb" aria-hidden>
          {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" /> : CATEGORY_EMOJI[recipe.category] ?? '🍽️'}
        </span>
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

/** Catalogue de recettes. En mode « choix », filtre d'abord les recettes adaptées au créneau. */
export function RecipesScreen({ pickFor, onPick }: { pickFor?: SlotId; onPick?: (id: string) => void }) {
  const { state } = useStore();
  const catalog = useCatalog();
  const [active, setActive] = useState<Filter[]>([]);
  const [q, setQ] = useState('');
  const [onlyFitting, setOnlyFitting] = useState(true);
  const [onlyAllowed, setOnlyAllowed] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [source, setSource] = useState<'popote' | 'explorer'>('popote');
  const constraint = pickFor ? slotConstraint(state.plan, pickFor, state.profiles) : null;

  const list = useMemo(() => {
    const needle = norm(q.trim());
    return Object.values(catalog.recipes)
      .filter((r) => {
        if (needle && !norm(r.name).includes(needle) && !norm(r.summary).includes(needle) && !r.ingredients.some((ri) => norm(catalog.ingredients[ri.ingredientId]?.name ?? '').includes(needle)))
          return false;
        if (!active.every((f) => FILTERS.find((x) => x.id === f)!.test(r, state.favorites, state.ratings))) return false;
        if (onlyAllowed && !recipeAllowed(r, state.settings, catalog)) return false;
        if (onlyAllowed && state.ratings[r.id] === -1 && !active.includes('aimees')) return false;
        if (pickFor && onlyFitting && !recipeFitsSlot(r, state.plan, pickFor, state.profiles)) return false;
        return true;
      })
      .sort((a, b) => {
        // Favoris et recettes aimées d'abord, puis ordre alphabétique.
        const score = (r: Recipe) => (state.favorites.includes(r.id) ? -2 : 0) + (state.ratings[r.id] === 1 ? -1 : 0);
        return score(a) - score(b) || a.name.localeCompare(b.name, 'fr');
      });
  }, [q, active, onlyFitting, onlyAllowed, pickFor, state, catalog]);

  const toggle = (f: Filter) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]));

  return (
    <div className="screen">
      {!pickFor && <ScreenHeader title="Recettes" subtitle={`${Object.keys(catalog.recipes).length} recettes maison · hors ligne`} />}
      {!pickFor && (
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { id: 'popote', label: 'Popote' },
            { id: 'explorer', label: '🌍 Explorer en ligne' },
          ]}
        />
      )}
      {source === 'explorer' && !pickFor ? (
        <ExplorerScreen />
      ) : (
        <>
          <div className="search-wrap">
            <Icon name="search" size={18} />
            <input className="search" type="search" placeholder="Plat ou ingrédient : poulet, courgette…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips scroll">
            {FILTERS.map((f) => (
              <Chip key={f.id} active={active.includes(f.id)} onClick={() => toggle(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>
          {pickFor && constraint !== 'aucune' && (
            <label className="check-line small">
              <input type="checkbox" checked={onlyFitting} onChange={(e) => setOnlyFitting(e.target.checked)} />
              {constraint === 'boite_froide' ? 'Boîte mangeable froide' : 'Boîte transportable'} ({slotLabel(state.plan, pickFor).toLowerCase()} au travail)
            </label>
          )}
          <label className="check-line small">
            <input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />
            Respecter mes exclusions et les « plus jamais »
          </label>
          <p className="label">
            {list.length} recette{list.length > 1 ? 's' : ''}
          </p>
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
                Retirez un filtre ou essayez l’onglet Explorer.
              </Empty>
            )}
          </div>
        </>
      )}
      {open && (
        <Sheet title="Recette" onClose={() => setOpen(null)}>
          <RecipeDetail recipeId={open} onPick={onPick ? () => onPick(open) : undefined} />
        </Sheet>
      )}
    </div>
  );
}
