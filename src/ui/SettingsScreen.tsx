import { useMemo, useRef, useState } from 'react';
import type { Allergen, Day, ProfileId, RoleFactors, StoreId, Unit } from '../domain/types';
import { CATALOG } from '../data/catalog';
import { ALLERGEN_LABELS } from '../data/aisles';
import { ASSUMPTIONS } from '../data/defaults';
import { COMPLEMENTS } from '../data/sides';
import { STORE_LABELS, formatEuro } from '../domain/budget';
import { formatAmount } from '../domain/units';
import { DAYS, DAY_LABELS, PROFILE_IDS } from '../domain/week';
import { exportJson, parseImport } from '../state/persistence';
import { useStore } from '../state/store';
import { parsePriceCsv } from '../domain/priceImport';
import { todayIso } from '../domain/inventory';
import { INSEE_SOURCE, REFERENCE_PRICES } from '../data/referencePrices';
import { Chip, Stepper, Toggle, portionLabel } from './common';

const FACTOR_LABELS: { key: keyof RoleFactors; label: string }[] = [
  { key: 'portion', label: 'Portion globale' },
  { key: 'feculent', label: 'Féculents (pâtes, riz, pain, pommes de terre)' },
  { key: 'proteine', label: 'Viande, poisson, œufs, légumineuses' },
  { key: 'legume', label: 'Légumes' },
  { key: 'sauce', label: 'Sauces, fromage, matières grasses' },
];

const INGREDIENT_OPTIONS = Object.values(CATALOG.ingredients).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const s = state.settings;

  const doExport = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `popote-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const next = parseImport(await file.text(), CATALOG);
      if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
      dispatch({ type: 'replaceState', state: next });
      setImportMsg('✓ Sauvegarde importée.');
    } catch (e) {
      setImportMsg(`Import impossible : ${(e as Error).message}`);
    }
  };

  return (
    <div className="screen">
      <h1>Paramètres</h1>

      <section className="card">
        <h3>Valeurs supposées (à ajuster)</h3>
        <ul className="plain small">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      </section>

      {PROFILE_IDS.map((p) => (
        <ProfileCard key={p} id={p} />
      ))}

      <section className="card">
        <h3>Repères nutritionnels (indicatifs)</h3>
        <p className="small">
          Popote ne calcule pas d’objectif calorique : l’âge, la taille et le poids ne suffisent pas, il manque votre activité réelle sur le chantier, votre sommeil, votre faim… Repères généraux pour une perte de poids progressive et tenable :
        </p>
        <ul className="plain small">
          <li>• Une assiette avec environ ½ légumes, ¼ protéines, ¼ féculents, et des féculents ajustés à l’activité du jour plutôt que supprimés.</li>
          <li>• Manger à sa faim, lentement ; une collation (fruit, yaourt, poignée d’amandes) vaut mieux qu’une grosse fringale en fin de journée.</li>
          <li>• Les jours de chantier très physiques, augmentez la portion du midi (×1,25) : ce n’est pas un écart.</li>
          <li>• Pour un objectif chiffré ou un suivi, un médecin ou un·e diététicien·ne peut le personnaliser. Notez son conseil dans votre profil.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Organisation de la semaine</h3>
        <div className="field">
          <span>Jours de préparation (batch cooking)</span>
          <div className="chips">
            {DAYS.map((d) => (
              <Chip
                key={d}
                active={s.prepDays.includes(d)}
                onClick={() =>
                  dispatch({
                    type: 'updateSettings',
                    patch: { prepDays: s.prepDays.includes(d) ? s.prepDays.filter((x) => x !== d) : ([...s.prepDays, d].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)) as Day[]) },
                  })
                }
              >
                {DAY_LABELS[d]}
              </Chip>
            ))}
          </div>
          <button className="btn" onClick={() => dispatch({ type: 'applyPrepDays' })}>
            Appliquer ces jours à tous les repas
          </button>
        </div>
        <label className="field">
          <span>Temps actif maximum par recette</span>
          <select value={s.maxActiveMin ?? ''} onChange={(e) => dispatch({ type: 'updateSettings', patch: { maxActiveMin: e.target.value ? Number(e.target.value) : null } })}>
            <option value="">Pas de limite</option>
            <option value="15">15 min</option>
            <option value="20">20 min</option>
            <option value="30">30 min</option>
          </select>
        </label>
        <label className="field">
          <span>Coût relatif maximum</span>
          <select value={s.maxCostLevel ?? ''} onChange={(e) => dispatch({ type: 'updateSettings', patch: { maxCostLevel: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null } })}>
            <option value="">Pas de limite</option>
            <option value="1">€ uniquement</option>
            <option value="2">Jusqu’à €€</option>
          </select>
        </label>
        <Toggle
          checked={s.useLeftoversInSuggestions}
          onChange={(v) => dispatch({ type: 'updateSettings', patch: { useLeftoversInSuggestions: v } })}
          label="Les suggestions peuvent réutiliser le dîner de la veille pour un déjeuner"
        />
        <Toggle
          checked={s.deductInventory}
          onChange={(v) => dispatch({ type: 'updateSettings', patch: { deductInventory: v } })}
          label="Déduire le stock du frigo (non périmé) de la liste de courses"
        />
        <label className="field">
          <span>Magasin habituel (pour le budget)</span>
          <select value={s.preferredStore ?? ''} onChange={(e) => dispatch({ type: 'updateSettings', patch: { preferredStore: (e.target.value || null) as StoreId | null } })}>
            <option value="">Non précisé</option>
            {(Object.keys(STORE_LABELS) as StoreId[]).map((st) => (
              <option key={st} value={st}>
                {STORE_LABELS[st]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h3>Exclusions</h3>
        <div className="field">
          <span>Allergènes à exclure</span>
          <div className="chips">
            {(Object.keys(ALLERGEN_LABELS) as Allergen[]).map((a) => (
              <Chip
                key={a}
                active={s.excludedAllergens.includes(a)}
                onClick={() =>
                  dispatch({
                    type: 'updateSettings',
                    patch: { excludedAllergens: s.excludedAllergens.includes(a) ? s.excludedAllergens.filter((x) => x !== a) : [...s.excludedAllergens, a] },
                  })
                }
              >
                {ALLERGEN_LABELS[a]}
              </Chip>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Ingrédients exclus</span>
          <select
            value=""
            onChange={(e) => e.target.value && dispatch({ type: 'updateSettings', patch: { excludedIngredients: [...s.excludedIngredients, e.target.value] } })}
          >
            <option value="">Ajouter un ingrédient…</option>
            {INGREDIENT_OPTIONS.filter((i) => !s.excludedIngredients.includes(i.id)).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <div className="chips">
            {s.excludedIngredients.map((i) => (
              <Chip key={i} active onClick={() => dispatch({ type: 'updateSettings', patch: { excludedIngredients: s.excludedIngredients.filter((x) => x !== i) } })}>
                {CATALOG.ingredients[i].name} ✕
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <PantryCard />

      <section className="card">
        <h3>Frigo et scan</h3>
        <p className="small">
          {Object.keys(state.products).length} produit(s) mémorisé(s) par code-barres · {Object.keys(state.aliases).length} libellé(s) de ticket appris ·{' '}
          {state.customRecipes.length} recette(s) vide-frigo gardée(s).
        </p>
        <button
          className="btn"
          disabled={Object.keys(state.aliases).length === 0}
          onClick={() => confirm('Oublier les libellés de ticket appris ?') && dispatch({ type: 'clearAliases' })}
        >
          Oublier les libellés appris
        </button>
      </section>

      <PricesCard />

      <section className="card">
        <h3>Transport et conservation</h3>
        <ul className="plain small">
          <li>• Un sac isotherme ne produit pas de froid : il ralentit seulement le réchauffement. Ajoutez au moins 2 pains de glace bien congelés, collez la boîte contre eux, gardez le sac fermé et à l’ombre (pas dans la cabine du véhicule au soleil).</li>
          <li>• S’il y a un réfrigérateur sur place, utilisez-le. Sinon, un aliment périssable ne devrait pas rester plus de 2 h hors du froid (1 h au-dessus de 32 °C) : par forte chaleur, préférez les plats les moins sensibles (sans mayonnaise, sans poisson cru ou fumé).</li>
          <li>• Refroidir les plats cuisinés rapidement (moins de 2 h) avant de les mettre au réfrigérateur, qui doit être à 4 °C maximum.</li>
          <li>• Décongeler au réfrigérateur la veille, jamais à température ambiante. Réchauffer jusqu’à ce que ce soit bien chaud à cœur, une seule fois.</li>
          <li>• Les durées indiquées sont des repères prudents : en cas de doute (odeur, aspect), ne pas consommer.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Sauvegarde</h3>
        <p className="muted small">Les données sont enregistrées automatiquement sur cet appareil. Exportez régulièrement un fichier pour ne rien perdre (changement de téléphone, effacement des données Safari).</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={doExport}>
            Exporter (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Importer…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        {importMsg && <p className="note info">{importMsg}</p>}
        <button
          className="btn danger"
          onClick={() => confirm('Tout réinitialiser ? Planning, profils, placard et prix seront effacés.') && dispatch({ type: 'reset' })}
        >
          Réinitialiser l’application
        </button>
      </section>
      <p className="muted small center">Popote fonctionne hors ligne, sans compte ni clé d’API.</p>
    </div>
  );
}

function ProfileCard({ id }: { id: ProfileId }) {
  const { state, dispatch } = useStore();
  const p = state.profiles[id];
  const update = (patch: Partial<typeof p>) => dispatch({ type: 'updateProfile', profile: id, patch });
  return (
    <section className="card">
      <h3>Profil « {p.name} »</h3>
      <label className="field">
        <span>Nom affiché</span>
        <input type="text" value={p.name} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Déjeuner en semaine</span>
        <select value={p.lunchPlace} onChange={(e) => update({ lunchPlace: e.target.value as typeof p.lunchPlace })}>
          <option value="chantier">Sur un chantier (boîte)</option>
          <option value="travail">Au travail (boîte)</option>
          <option value="maison">À la maison</option>
        </select>
      </label>
      {p.lunchPlace !== 'maison' && (
        <Toggle checked={p.microwaveAtLunch} onChange={(v) => update({ microwaveAtLunch: v })} label="Micro-ondes disponible le midi" />
      )}
      <div className="field">
        <span>Ajustement des quantités</span>
        <p className="muted small">
          1 = portion adulte standard. Pour {id === 'moi' ? 'vous' : 'elle'}, ces facteurs s’appliquent à chaque plat, puis on peut encore ajuster repas par repas.
        </p>
        {FACTOR_LABELS.map((f) => (
          <div key={f.key} className="field-inline">
            <span>{f.label}</span>
            <Stepper value={p.factors[f.key]} min={0.5} max={2} step={0.05} format={portionLabel} onChange={(v) => update({ factors: { ...p.factors, [f.key]: v } })} />
          </div>
        ))}
      </div>
      <div className="field">
        <span>Compléments ajoutés par défaut au déjeuner (nouveaux repas)</span>
        <div className="chips">
          {COMPLEMENTS.map((c) => (
            <Chip
              key={c.id}
              active={p.defaultLunchExtras.includes(c.id)}
              onClick={() =>
                update({ defaultLunchExtras: p.defaultLunchExtras.includes(c.id) ? p.defaultLunchExtras.filter((x) => x !== c.id) : [...p.defaultLunchExtras, c.id] })
              }
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Repère personnel (facultatif)</span>
        <textarea rows={2} value={p.personalNote} placeholder="ex. conseil de votre médecin ou diététicien·ne" onChange={(e) => update({ personalNote: e.target.value })} />
      </label>
    </section>
  );
}

function PantryCard() {
  const { state, dispatch } = useStore();
  const [ingredientId, setIngredientId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const items = useMemo(
    () => [...state.pantry].sort((a, b) => CATALOG.ingredients[a.ingredientId].name.localeCompare(CATALOG.ingredients[b.ingredientId].name, 'fr')),
    [state.pantry],
  );
  const selected = ingredientId ? CATALOG.ingredients[ingredientId] : null;
  const units: Unit[] = selected?.unit === 'pc' ? ['pc'] : selected?.unit === 'ml' ? ['ml', 'cl', 'l'] : ['g', 'kg'];

  const add = (unlimited: boolean) => {
    if (!selected) return;
    const q = parseFloat(qty.replace(',', '.'));
    if (!unlimited && !(q > 0)) return;
    dispatch({ type: 'setPantryItem', item: { ingredientId: selected.id, qty: unlimited ? null : q, unit: unlimited ? selected.unit : unit } });
    setIngredientId('');
    setQty('');
  };

  return (
    <section className="card">
      <h3>Placard (déjà à la maison)</h3>
      <p className="muted small">« En stock » : jamais ajouté à la liste. Avec une quantité : déduite du besoin.</p>
      <ul className="plain small">
        {items.map((p) => (
          <li key={p.ingredientId} className="row space-between">
            <span>
              {CATALOG.ingredients[p.ingredientId].name} — {p.qty === null ? 'en stock' : formatAmount(p.qty, p.unit)}
            </span>
            <button className="btn-link" onClick={() => dispatch({ type: 'removePantryItem', ingredientId: p.ingredientId })}>
              retirer
            </button>
          </li>
        ))}
      </ul>
      <select
        value={ingredientId}
        onChange={(e) => {
          setIngredientId(e.target.value);
          const ing = CATALOG.ingredients[e.target.value];
          if (ing) setUnit(ing.unit === 'pc' ? 'pc' : ing.unit === 'ml' ? 'ml' : 'g');
        }}
      >
        <option value="">Ajouter un ingrédient…</option>
        {INGREDIENT_OPTIONS.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      {selected && (
        <div className="row gap wrap">
          <input className="narrow" inputMode="decimal" placeholder="Quantité" value={qty} onChange={(e) => setQty(e.target.value)} />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => add(false)}>
            Ajouter
          </button>
          <button className="btn" onClick={() => add(true)}>
            En stock
          </button>
        </div>
      )}
    </section>
  );
}

const SOURCE_LABELS = { saisie: 'saisi', ticket: 'ticket', import: 'importé' } as const;

function PricesCard() {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const [store, setStore] = useState<StoreId>(state.settings.preferredStore ?? 'leclerc');
  const [report, setReport] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const sorted = [...state.prices].sort((a, b) => b.date.localeCompare(a.date));
  const shown = showAll ? sorted : sorted.slice(0, 15);

  const runImport = (csv: string) => {
    const { entries, errors } = parsePriceCsv(csv, CATALOG, state.aliases, store, todayIso());
    if (entries.length) dispatch({ type: 'addPrices', entries });
    setReport([`${entries.length} prix importé(s).`, ...errors.slice(0, 8), ...(errors.length > 8 ? [`… et ${errors.length - 8} autre(s) ligne(s) ignorée(s).`] : [])]);
    if (entries.length) setText('');
  };

  return (
    <section className="card">
      <h3>Prix</h3>
      <p className="muted small">
        Utilisés dans l’ordre : vos relevés du magasin habituel, vos autres relevés, puis la moyenne nationale{' '}
        <a href={INSEE_SOURCE.url} target="_blank" rel="noreferrer">
          INSEE
        </a>{' '}
        ({REFERENCE_PRICES.length} produits, mis à jour le {new Date(INSEE_SOURCE.fetchedAt).toLocaleDateString('fr-FR')}).
      </p>
      {sorted.length === 0 ? (
        <p className="muted small">Aucun relevé personnel. Scannez un ticket (Frigo › Ticket), saisissez un prix depuis la liste de courses, ou importez un fichier ci-dessous.</p>
      ) : (
        <>
          <ul className="plain small">
            {shown.map((p) => (
              <li key={p.id}>
                {CATALOG.ingredients[p.ingredientId].name} — {STORE_LABELS[p.store]} : {formatEuro(p.price)} / {p.perQty} {p.perUnit} ({new Date(p.date).toLocaleDateString('fr-FR')}, {SOURCE_LABELS[p.source ?? 'saisie']})
                <button className="btn-link" onClick={() => dispatch({ type: 'removePrice', id: p.id })}>
                  supprimer
                </button>
              </li>
            ))}
          </ul>
          {sorted.length > 15 && (
            <button className="btn-link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Réduire' : `Voir les ${sorted.length} relevés`}
            </button>
          )}
        </>
      )}
      <div className="field">
        <span>Importer des relevés (CSV ou copier-coller)</span>
        <p className="muted small">Une ligne par prix : produit ; prix ; quantité ; unité ; magasin ; date — ex. « Filets de poulet;11,90;1;kg;Leclerc;2026-09-26 ». Seuls produit et prix sont obligatoires.</p>
        <textarea rows={4} value={text} placeholder={'Courgettes;2,49;1;kg\nLait demi-écrémé;1,05;1;l;Auchan'} onChange={(e) => setText(e.target.value)} />
        <div className="row gap wrap">
          <select value={store} onChange={(e) => setStore(e.target.value as StoreId)} aria-label="Magasin par défaut">
            {(Object.keys(STORE_LABELS) as StoreId[]).map((s) => (
              <option key={s} value={s}>
                {STORE_LABELS[s]} (par défaut)
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!text.trim()} onClick={() => runImport(text)}>
            Importer le texte
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Fichier CSV…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) runImport(await f.text());
              e.target.value = '';
            }}
          />
        </div>
        {report && (
          <ul className="plain small note info">
            {report.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
