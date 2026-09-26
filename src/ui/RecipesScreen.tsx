import { useMemo, useState, type ReactNode } from 'react';
import type { Recipe, SlotId } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { recipeAllowed, recipeFitsSlot } from '../domain/planner';
import { useCatalog, useStore } from '../state/store';
import { COST_LABEL, Chip, Sheet } from './common';
import { RecipeDetail } from './RecipeDetail';
import { ExplorerScreen } from './ExplorerScreen';
import { slotLabel } from '../domain/week';

type Filter = 'boite' | 'diner' | 'rapide' | 'eco' | 'restes' | 'vege' | 'favoris';

const FILTERS: { id: Filter; label: string; test: (r: Recipe, fav: string[]) => boolean }[] = [
  { id: 'boite', label: '🧊 Déjeuner froid / chantier', test: (r) => r.lunchbox && r.temperature !== 'chaud' },
  { id: 'diner', label: '🍲 Dîner', test: (r) => r.meals.includes('diner') },
  { id: 'rapide', label: '⏱ ≤ 20 min actives', test: (r) => r.activeMin <= 20 },
  { id: 'eco', label: '€ Économique', test: (r) => r.costLevel === 1 },
  { id: 'restes', label: '♻️ Idéal restes', test: (r) => r.leftoverFriendly },
  { id: 'vege', label: '🌱 Sans viande', test: (r) => !!r.vegetarian },
  { id: 'favoris', label: '★ Favoris', test: (r, fav) => fav.includes(r.id) },
];



function matchesText(r: Recipe, q: string): boolean {
  if (!q) return true;
  const n = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const needle = n(q);
  if (n(r.name).includes(needle) || n(r.summary).includes(needle)) return true;
  return r.ingredients.some((ri) => n(INGREDIENTS[ri.ingredientId].name).includes(needle));
}

export function RecipeCard({ recipe, onOpen, action }: { recipe: Recipe; onOpen: () => void; action?: ReactNode }) {
  const { state } = useStore();
  return (
    <article className="card recipe-card">
      <button className="recipe-card-main" onClick={onOpen}>
        <h3>
          {state.favorites.includes(recipe.id) && <span aria-label="favori">★ </span>}
          {state.ratings[recipe.id] === 1 && <span aria-label="aimée">👍 </span>}
          {state.ratings[recipe.id] === -1 && <span aria-label="écartée">👎 </span>}
          {recipe.name}
        </h3>
        <p className="muted">{recipe.summary}</p>
        <p className="meta">
          <span>⏱ {recipe.activeMin} min actives · {recipe.totalMin} min au total</span>
          <span>{COST_LABEL[recipe.costLevel]}</span>
          {recipe.lunchbox && recipe.temperature !== 'chaud' && <span>🧊 boîte froide</span>}
          {recipe.temperature === 'chaud' && <span>🔥 chaud</span>}
          {recipe.freezable && <span>❄️ congelable</span>}
        </p>
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

  const list = useMemo(() => {
    return Object.values(catalog.recipes).filter((r) => {
      if (!matchesText(r, q)) return false;
      if (!active.every((f) => FILTERS.find((x) => x.id === f)!.test(r, state.favorites))) return false;
      if (onlyAllowed && !recipeAllowed(r, state.settings, catalog)) return false;
      if (pickFor && onlyFitting && !recipeFitsSlot(r, pickFor, state.plan.slots[pickFor], state.profiles)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [q, active, onlyFitting, onlyAllowed, pickFor, state, catalog]);

  const toggle = (f: Filter) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]));

  return (
    <div className="screen">
      {!pickFor && <h1>Recettes</h1>}
      {!pickFor && (
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={source === 'popote'} className={source === 'popote' ? 'active' : ''} onClick={() => setSource('popote')}>
            Popote ({Object.keys(catalog.recipes).length})
          </button>
          <button role="tab" aria-selected={source === 'explorer'} className={source === 'explorer' ? 'active' : ''} onClick={() => setSource('explorer')}>
            🌍 Explorer en ligne
          </button>
        </div>
      )}
      {source === 'explorer' && !pickFor ? (
        <ExplorerScreen />
      ) : (
        <>
      <input className="search" type="search" placeholder="Rechercher un plat ou un ingrédient (ex. poulet, courgette)…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={active.includes(f.id)} onClick={() => toggle(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {pickFor && (
        <label className="check-line">
          <input type="checkbox" checked={onlyFitting} onChange={(e) => setOnlyFitting(e.target.checked)} />
          Seulement les recettes adaptées à {slotLabel(pickFor).toLowerCase()} (boîte froide si besoin)
        </label>
      )}
      <label className="check-line">
        <input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />
        Respecter mes exclusions et limites (Paramètres)
      </label>
      <p className="muted small">{list.length} recette{list.length > 1 ? 's' : ''}</p>
      <div className="stack">
        {list.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onOpen={() => setOpen(r.id)}
            action={
              onPick ? (
                <button className="btn primary block" onClick={() => onPick(r.id)}>
                  Choisir
                </button>
              ) : undefined
            }
          />
        ))}
        {list.length === 0 && <p className="empty">Aucune recette ne correspond. Retirez un filtre.</p>}
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
