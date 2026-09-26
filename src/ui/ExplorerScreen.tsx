import { useEffect, useState } from 'react';
import type { Unit } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { AREAS, CATEGORIES, browse, lookupMeal, proposeImport, searchMeals, toPopoteRecipe, type ImportLine, type Meal, type MealSummary } from '../domain/themealdb';
import { mealIngredients } from '../domain/themealdb';
import { useCatalog, useStore } from '../state/store';
import { Chip, Sheet, Stepper } from './common';
import { unitsFor } from './ItemForm';
import { toIngredientUnit } from '../domain/units';

const INGREDIENT_OPTIONS = Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

/** Recherche en ligne dans TheMealDB (≈ 800 recettes, souvent avec vidéo), import sur demande. */
export function ExplorerScreen() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MealSummary[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = async (p: Promise<MealSummary[] | null>, label: string) => {
    setStatus('Recherche…');
    const r = await p;
    if (r === null) {
      setStatus('Pas de connexion : l’exploration demande internet (vos recettes Popote restent disponibles hors ligne).');
      setResults(null);
      return;
    }
    setResults(r);
    setStatus(r.length ? `${r.length} recette(s) — ${label}` : `Aucun résultat pour ${label}.`);
  };

  return (
    <div className="stack">
      <p className="muted small">
        Recettes du monde de la base collaborative TheMealDB, souvent avec vidéo. <strong>En anglais</strong> ; « Importer » les convertit en recette Popote (portions, courses, frigo).
      </p>
      <form
        className="row gap"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) {
            setFilter(null);
            run(searchMeals(q), `« ${q} »`);
          }
        }}
      >
        <input type="search" placeholder="ex. poulet, curry, lasagnes, soupe…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" type="submit">
          Chercher
        </button>
      </form>
      <div className="chips">
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={filter === `c:${c.id}`}
            onClick={() => {
              setFilter(`c:${c.id}`);
              run(browse('c', c.id), c.label);
            }}
          >
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="chips">
        {AREAS.map((a) => (
          <Chip
            key={a.id}
            active={filter === `a:${a.id}`}
            onClick={() => {
              setFilter(`a:${a.id}`);
              run(browse('a', a.id), `cuisine ${a.label.toLowerCase()}`);
            }}
          >
            {a.label}
          </Chip>
        ))}
      </div>
      {status && <p className="muted small">{status}</p>}
      {results && (
        <div className="meal-grid">
          {results.map((m) => (
            <button key={m.id} className="meal-card" onClick={() => setOpen(m.id)}>
              {m.thumb && <img src={`${m.thumb}/small`} alt="" loading="lazy" />}
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {open && <MealSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MealSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const catalog = useCatalog();
  const [meal, setMeal] = useState<Meal | null | 'erreur'>(null);
  const [importing, setImporting] = useState(false);
  const imported = !!catalog.recipes[`mdb-${id}`];

  useEffect(() => {
    lookupMeal(id).then((m) => setMeal(m ?? 'erreur'));
  }, [id]);

  return (
    <Sheet title="Recette en ligne" onClose={onClose}>
      {meal === null && <p className="empty">Chargement…</p>}
      {meal === 'erreur' && <p className="empty">Recette indisponible (connexion ?).</p>}
      {meal && meal !== 'erreur' && !importing && (
        <div className="recipe-detail">
          <h2>{meal.strMeal}</h2>
          {meal.strMealThumb && <img className="recipe-photo" src={meal.strMealThumb} alt="" />}
          <p className="meta">
            {meal.strArea && <span>{AREAS.find((a) => a.id === meal.strArea)?.label ?? meal.strArea}</span>}
            {meal.strCategory && <span>{CATEGORIES.find((c) => c.id === meal.strCategory)?.label ?? meal.strCategory}</span>}
          </p>
          <div className="row gap wrap">
            {meal.strYoutube && (
              <a className="btn primary" href={meal.strYoutube} target="_blank" rel="noreferrer">
                ▶ Vidéo YouTube
              </a>
            )}
            {meal.strSource && (
              <a className="btn" href={meal.strSource} target="_blank" rel="noreferrer">
                Recette d’origine ↗
              </a>
            )}
          </div>
          {imported ? (
            <p className="note ok">✓ Déjà importée : retrouvez-la dans Recettes › Popote.</p>
          ) : (
            <button className="btn primary block" onClick={() => setImporting(true)}>
              Importer dans Popote
            </button>
          )}
          <h3>Ingrédients (anglais)</h3>
          <ul className="plain small">
            {mealIngredients(meal).map((i, k) => (
              <li key={k}>
                {i.measure} {i.name}
              </li>
            ))}
          </ul>
          <h3>Préparation (anglais)</h3>
          <p className="small pre-line">{meal.strInstructions}</p>
          <p className="muted small">Contenu fourni par TheMealDB et ses contributeurs. Astuce : Safari › « aA » › Traduire en français.</p>
        </div>
      )}
      {meal && meal !== 'erreur' && importing && <ImportForm meal={meal} onDone={onClose} />}
    </Sheet>
  );
}

function ImportForm({ meal, onDone }: { meal: Meal; onDone: () => void }) {
  const { dispatch } = useStore();
  const catalog = useCatalog();
  const [lines, setLines] = useState<ImportLine[]>(() => proposeImport(meal, catalog));
  const [servings, setServings] = useState(4);
  const [name, setName] = useState(meal.strMeal);
  const update = (k: number, patch: Partial<ImportLine>) => setLines((ls) => ls.map((l, i) => (i === k ? { ...l, ...patch } : l)));
  const usable = lines.filter((l) => l.ingredientId && l.qty && l.unit).length;

  return (
    <div className="stack">
      <h2>Importer « {meal.strMeal} »</h2>
      <label className="field">
        <span>Nom dans Popote</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field-inline">
        <span>La recette d’origine est pour (portions)</span>
        <Stepper value={servings} min={1} max={12} onChange={setServings} />
      </div>
      <p className="muted small">
        TheMealDB n’indique pas toujours le nombre de portions : 4 par défaut. Vérifiez chaque ingrédient (quantité totale de la recette) ; les lignes sans ingrédient ne compteront pas dans les courses.
      </p>
      <ul className="receipt-list">
        {lines.map((l, k) => (
          <li key={k} className={l.ingredientId ? 'receipt-row' : 'receipt-row off'}>
            <p className="small">
              <span className="mono">
                {l.measure} {l.name}
              </span>
              {!l.ingredientId && <span className="badge trop_long">non rattaché</span>}
            </p>
            <div className="receipt-edit">
              <select
                value={l.ingredientId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const units = unitsFor(id);
                  update(k, { ingredientId: id, unit: l.unit && units.includes(l.unit) ? l.unit : units[0] });
                }}
              >
                <option value="">— Ignorer —</option>
                {INGREDIENT_OPTIONS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              {l.ingredientId && (
                <div className="row gap">
                  <input
                    className="narrow"
                    inputMode="decimal"
                    value={l.qty === null ? '' : String(Math.round(l.qty * 100) / 100).replace('.', ',')}
                    placeholder="qté"
                    onChange={(e) => update(k, { qty: parseFloat(e.target.value.replace(',', '.')) || null })}
                  />
                  <select value={l.unit ?? ''} onChange={(e) => update(k, { unit: e.target.value as Unit })}>
                    {!l.unit && <option value="">unité</option>}
                    {[...new Set<Unit>([...unitsFor(l.ingredientId), 'cc', 'cs'])].filter((u) => toIngredientUnit(1, u, INGREDIENTS[l.ingredientId!]) !== null).map((u) => (
                      <option key={u} value={u}>
                        {u === 'cc' ? 'c. à c.' : u === 'cs' ? 'c. à s.' : u}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button
        className="btn primary block"
        disabled={usable === 0 || !name.trim()}
        onClick={() => {
          dispatch({ type: 'keepRecipe', recipe: toPopoteRecipe(meal, lines, servings, name.trim(), catalog) });
          onDone();
        }}
      >
        Importer ({usable} ingrédient(s) structurés)
      </button>
    </div>
  );
}
