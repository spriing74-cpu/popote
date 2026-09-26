import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Allergen, ProfileId, RoleFactors, StoreId, ThemeId, Unit } from '../domain/types';
import { CATALOG } from '../data/catalog';
import { ALLERGEN_LABELS } from '../data/aisles';
import { ASSUMPTIONS } from '../data/defaults';
import { COMPLEMENTS } from '../data/sides';
import { STORE_LABELS, formatEuro } from '../domain/budget';
import { formatAmount } from '../domain/units';
import { MAX_DAYS, PROFILE_IDS, WEEKDAY_LABELS, WEEKDAY_ORDER, WEEKDAY_SHORT } from '../domain/week';
import { exportJson, parseImport } from '../state/persistence';
import { useCatalog, useStore } from '../state/store';
import { importStoreCatalog, isStoreCatalogCsv, parsePriceCsv, type CatalogImportResult } from '../domain/priceImport';
import { AiServiceCard, EquipmentCard } from './EquipmentScreen';
import { todayIso } from '../domain/inventory';
import { NUTRITION_SOURCE } from '../domain/nutrition';
import { INSEE_SOURCE } from '../data/referencePrices';
import { Chip, ListGroup, ListRow, ScreenHeader, Segmented, Sheet, Stepper, Toggle, portionLabel } from './common';

const FACTOR_LABELS: { key: keyof RoleFactors; label: string }[] = [
  { key: 'portion', label: 'Portion globale' },
  { key: 'feculent', label: 'Féculents' },
  { key: 'proteine', label: 'Viande, poisson, œufs' },
  { key: 'legume', label: 'Légumes' },
  { key: 'sauce', label: 'Sauces, fromage, gras' },
];

const INGREDIENT_OPTIONS = Object.values(CATALOG.ingredients).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

type Page = ProfileId | 'semaine' | 'suggestions' | 'gouts' | 'cuisine' | 'placard' | 'courses' | 'prix' | 'scan' | 'ia' | 'donnees' | 'apropos';

const days = (list: number[]) =>
  list.length === 0 ? 'aucun' : list.length === 7 ? 'tous les jours' : WEEKDAY_ORDER.filter((d) => list.includes(d)).map((d) => WEEKDAY_SHORT[d].toLowerCase()).join(', ');

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const [page, setPage] = useState<Page | null>(null);
  const s = state.settings;
  const banned = Object.values(state.ratings).filter((v) => v === -1).length;
  const exclusions = s.excludedAllergens.length + s.excludedIngredients.length + banned;

  const PAGES: Record<Page, { title: string; body: ReactNode }> = {
    moi: { title: state.profiles.moi.name, body: <ProfileCard id="moi" /> },
    compagne: { title: state.profiles.compagne.name, body: <ProfileCard id="compagne" /> },
    semaine: { title: 'Semaine et batch cooking', body: <WeekSettings /> },
    suggestions: { title: 'Suggestions', body: <SuggestionSettings /> },
    gouts: { title: 'Goûts et exclusions', body: <TasteSettings /> },
    cuisine: { title: 'Ma cuisine', body: <EquipmentCard /> },
    placard: { title: 'Placard de base', body: <PantryCard /> },
    courses: { title: 'Courses', body: <ShoppingSettings /> },
    prix: { title: 'Relevés de prix', body: <PricesCard /> },
    scan: { title: 'Scan et mémoire', body: <ScanSettings /> },
    ia: { title: 'Service IA', body: <AiServiceCard /> },
    donnees: { title: 'Sauvegarde', body: <BackupCard /> },
    apropos: { title: 'Conseils et sources', body: <AboutCard /> },
  };

  return (
    <div className="screen">
      <ScreenHeader title="Réglages" subtitle="Tout fonctionne hors ligne, sans compte" />

      <ListGroup title="Foyer">
        {PROFILE_IDS.map((p) => {
          const prof = state.profiles[p];
          return (
            <ListRow
              key={p}
              icon="user"
              tint={p === 'moi' ? '#ff7a45' : '#a35cff'}
              label={prof.name}
              detail={`${prof.lunchPlace === 'maison' ? 'Déjeune à la maison' : `Boîte le midi : ${days(prof.workWeekdays)}`}${prof.microwaveAtLunch ? ' · micro-ondes' : ''}`}
              onClick={() => setPage(p)}
            />
          );
        })}
      </ListGroup>

      <ListGroup title="Planning">
        <ListRow
          icon="calendar"
          tint="#2f80ed"
          label="Semaine et batch cooking"
          detail={`${WEEKDAY_LABELS[s.startWeekday]} · ${s.planDays} jours · cuisine : ${days(s.prepWeekdays)}`}
          onClick={() => setPage('semaine')}
        />
        <ListRow icon="sparkles" tint="#f2a900" label="Suggestions" detail={suggestionSummary(s.maxActiveMin, s.maxCostLevel, s.useLeftoversInSuggestions)} onClick={() => setPage('suggestions')} />
        <ListRow icon="ban" tint="#e0352b" label="Goûts et exclusions" value={exclusions || undefined} detail={banned ? `${banned} plat(s) « plus jamais »` : 'Allergènes, ingrédients, plats écartés'} onClick={() => setPage('gouts')} />
      </ListGroup>

      <ListGroup title="Cuisine et courses">
        <ListRow icon="pot" tint="#1f9d55" label="Ma cuisine" value={state.equipment.length || undefined} detail="Four, airfryer… réglages adaptés aux recettes" onClick={() => setPage('cuisine')} />
        <ListRow icon="box" tint="#8d6e63" label="Placard de base" value={state.pantry.length} onClick={() => setPage('placard')} />
        <ListRow icon="cart" tint="#00a3a3" label="Courses" detail={s.deductInventory ? 'Frigo déduit de la liste' : 'Frigo non déduit'} onClick={() => setPage('courses')} />
        <ListRow icon="tag" tint="#607d8b" label="Relevés de prix" value={state.prices.length || undefined} onClick={() => setPage('prix')} />
        <ListRow icon="scan" tint="#5c6bc0" label="Scan et mémoire" detail={`${Object.keys(state.products).length} produits · ${Object.keys(state.aliases).length} libellés appris`} onClick={() => setPage('scan')} />
      </ListGroup>

      <ListGroup title="Apparence">
        <div className="card" style={{ margin: 0, border: 0, boxShadow: 'none', background: 'transparent' }}>
          <div className="theme-picker">
            {(
              [
                { id: 'glass', name: 'Liquid Glass' },
                { id: 'nothing', name: 'Nothing' },
              ] as { id: ThemeId; name: string }[]
            ).map((t) => (
              <button key={t.id} className={s.theme === t.id ? 'theme-tile active' : 'theme-tile'} onClick={() => dispatch({ type: 'updateSettings', patch: { theme: t.id } })} aria-pressed={s.theme === t.id}>
                <span className={`theme-preview ${t.id}`} aria-hidden>
                  {t.id === 'glass' ? (
                    <>
                      <i />
                      <i style={{ width: '70%' }} />
                      <i style={{ width: '45%' }} />
                    </>
                  ) : (
                    <>
                      POPOTE
                      <span>
                        <b /> 12/16 REPAS
                      </span>
                    </>
                  )}
                </span>
                <span className="theme-name">{t.name}</span>
              </button>
            ))}
          </div>
          <Segmented
            value={s.colorScheme}
            onChange={(v) => dispatch({ type: 'updateSettings', patch: { colorScheme: v } })}
            options={[
              { id: 'auto', label: 'Auto' },
              { id: 'light', label: 'Clair' },
              { id: 'dark', label: 'Sombre' },
            ]}
          />
        </div>
      </ListGroup>

      <ListGroup title="Données et aide">
        <ListRow icon="database" tint="#455a64" label="Sauvegarde" detail="Exporter, importer, réinitialiser" onClick={() => setPage('donnees')} />
        <ListRow icon="wand" tint="#7c4dff" label="Service IA" value={s.aiServiceUrl ? 'Activé' : 'Désactivé'} onClick={() => setPage('ia')} />
        <ListRow icon="info" tint="#9e9e9e" label="Conseils et sources" detail="Conservation, nutrition, hypothèses" onClick={() => setPage('apropos')} />
      </ListGroup>

      {page && (
        <Sheet title={PAGES[page].title} onClose={() => setPage(null)}>
          {PAGES[page].body}
        </Sheet>
      )}
    </div>
  );
}

function suggestionSummary(maxMin: number | null, maxCost: number | null, leftovers: boolean): string {
  const parts = [maxMin ? `≤ ${maxMin} min` : 'toutes durées', maxCost ? `jusqu’à ${'€'.repeat(maxCost)}` : 'tous budgets'];
  if (leftovers) parts.push('restes le midi');
  return parts.join(' · ');
}

function WeekdayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="chips">
      {WEEKDAY_ORDER.map((d) => (
        <Chip key={d} active={value.includes(d)} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}>
          {WEEKDAY_SHORT[d]}
        </Chip>
      ))}
    </div>
  );
}

function ProfileCard({ id }: { id: ProfileId }) {
  const { state, dispatch } = useStore();
  const p = state.profiles[id];
  const update = (patch: Partial<typeof p>) => dispatch({ type: 'updateProfile', profile: id, patch });
  return (
    <>
      <section className="card">
        <label className="field" style={{ marginTop: 0 }}>
          <span>Nom affiché</span>
          <input type="text" value={p.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
      </section>
      <section className="card">
        <h3>Le midi</h3>
        <label className="field">
          <span>Les jours travaillés, déjeune…</span>
          <select value={p.lunchPlace} onChange={(e) => update({ lunchPlace: e.target.value as typeof p.lunchPlace })}>
            <option value="chantier">Sur un chantier (boîte)</option>
            <option value="travail">Au travail (boîte)</option>
            <option value="maison">À la maison</option>
          </select>
        </label>
        {p.lunchPlace !== 'maison' && (
          <>
            <div className="field">
              <span>Jours travaillés</span>
              <WeekdayChips value={p.workWeekdays} onChange={(v) => update({ workWeekdays: v })} />
              <p className="muted small">Les autres jours, le déjeuner se prend à la maison : plats chauds possibles.</p>
            </div>
            <Toggle checked={p.microwaveAtLunch} onChange={(v) => update({ microwaveAtLunch: v })} label="Micro-ondes disponible le midi" />
          </>
        )}
        <div className="field">
          <span>Compléments ajoutés au déjeuner</span>
          <div className="chips">
            {COMPLEMENTS.map((c) => (
              <Chip
                key={c.id}
                active={p.defaultLunchExtras.includes(c.id)}
                onClick={() => update({ defaultLunchExtras: p.defaultLunchExtras.includes(c.id) ? p.defaultLunchExtras.filter((x) => x !== c.id) : [...p.defaultLunchExtras, c.id] })}
              >
                {c.name}
              </Chip>
            ))}
          </div>
          <p className="muted small">S’applique aux prochains repas créés.</p>
        </div>
      </section>
      <section className="card">
        <h3>Quantités</h3>
        <p className="muted small">×1 = portion adulte standard. Ces facteurs s’appliquent à chaque plat ; chaque repas reste ajustable.</p>
        {FACTOR_LABELS.map((f) => (
          <div key={f.key} className="field-inline">
            <span>{f.label}</span>
            <Stepper value={p.factors[f.key]} min={0.5} max={2} step={0.05} format={portionLabel} onChange={(v) => update({ factors: { ...p.factors, [f.key]: v } })} />
          </div>
        ))}
      </section>
      <section className="card">
        <label className="field" style={{ marginTop: 0 }}>
          <span>Repère personnel (facultatif)</span>
          <textarea rows={2} value={p.personalNote} placeholder="ex. conseil de votre médecin ou diététicien·ne" onChange={(e) => update({ personalNote: e.target.value })} />
        </label>
      </section>
    </>
  );
}

function WeekSettings() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'updateSettings', patch });
  return (
    <>
      <section className="card">
        <h3>Nouveaux plannings</h3>
        <div className="field">
          <span>Premier jour</span>
          <div className="chips">
            {WEEKDAY_ORDER.map((d) => (
              <Chip key={d} active={s.startWeekday === d} onClick={() => set({ startWeekday: d })}>
                {WEEKDAY_SHORT[d]}
              </Chip>
            ))}
          </div>
        </div>
        <div className="field-inline">
          <span>Durée</span>
          <Stepper value={s.planDays} min={1} max={MAX_DAYS} onChange={(v) => set({ planDays: v })} format={(v) => `${v} j`} />
        </div>
        <p className="muted small">
          {WEEKDAY_LABELS[s.startWeekday]} + {s.planDays - 1} jour(s)
          {s.planDays === 8 && s.startWeekday === 0 ? ' : du dimanche au dimanche.' : '.'} Le planning en cours se règle depuis Semaine (icône de réglage).
        </p>
      </section>
      <section className="card">
        <h3>Jours de batch cooking</h3>
        <WeekdayChips value={s.prepWeekdays} onChange={(v) => set({ prepWeekdays: v })} />
        <p className="muted small">Chaque repas est cuisiné le dernier jour de batch qui le précède. Au-delà de la durée de conservation, Popote propose de congeler.</p>
        <button className="btn block" onClick={() => dispatch({ type: 'applyPrepDays' })}>
          Appliquer au planning en cours
        </button>
      </section>
    </>
  );
}

function SuggestionSettings() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'updateSettings', patch });
  return (
    <section className="card">
      <label className="field" style={{ marginTop: 0 }}>
        <span>Temps actif maximum par recette</span>
        <select value={s.maxActiveMin ?? ''} onChange={(e) => set({ maxActiveMin: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Pas de limite</option>
          <option value="15">15 min</option>
          <option value="20">20 min</option>
          <option value="30">30 min</option>
        </select>
      </label>
      <label className="field">
        <span>Coût relatif maximum</span>
        <select value={s.maxCostLevel ?? ''} onChange={(e) => set({ maxCostLevel: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null })}>
          <option value="">Pas de limite</option>
          <option value="1">€ uniquement</option>
          <option value="2">Jusqu’à €€</option>
        </select>
      </label>
      <Toggle checked={s.useLeftoversInSuggestions} onChange={(v) => set({ useLeftoversInSuggestions: v })} label="Réutiliser le dîner de la veille pour un déjeuner" />
      <p className="muted small">Les suggestions tiennent aussi compte de vos 👍 / 👎, des 8 dernières semaines et de ce qui périme dans le frigo.</p>
    </section>
  );
}

function TasteSettings() {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const s = state.settings;
  const banned = Object.entries(state.ratings).filter(([, v]) => v === -1).map(([id]) => id);
  return (
    <>
      <section className="card">
        <h3>Allergènes à exclure</h3>
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
      </section>
      <section className="card">
        <h3>Ingrédients exclus</h3>
        <select value="" onChange={(e) => e.target.value && dispatch({ type: 'updateSettings', patch: { excludedIngredients: [...s.excludedIngredients, e.target.value] } })}>
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
      </section>
      <section className="card">
        <h3>Plats « plus jamais »</h3>
        {banned.length === 0 ? (
          <p className="muted small">Aucun. Touchez 👎 sur une fiche recette pour ne plus la voir proposée.</p>
        ) : (
          <div className="chips">
            {banned.map((id) => (
              <Chip key={id} active onClick={() => dispatch({ type: 'rateRecipe', recipeId: id, value: 0 })}>
                {catalog.recipes[id]?.name ?? id} ✕
              </Chip>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ShoppingSettings() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  return (
    <section className="card">
      <Toggle
        checked={s.deductInventory}
        onChange={(v) => dispatch({ type: 'updateSettings', patch: { deductInventory: v } })}
        label="Déduire le stock du frigo (non périmé) de la liste"
      />
      <label className="field">
        <span>Magasin habituel</span>
        <select value={s.preferredStore ?? ''} onChange={(e) => dispatch({ type: 'updateSettings', patch: { preferredStore: (e.target.value || null) as StoreId | null } })}>
          <option value="">Non précisé</option>
          {(Object.keys(STORE_LABELS) as StoreId[]).map((st) => (
            <option key={st} value={st}>
              {STORE_LABELS[st]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Proposé par défaut quand vous importez un ticket.</p>
    </section>
  );
}

function ScanSettings() {
  const { state, dispatch } = useStore();
  return (
    <section className="card">
      <p className="small">
        {Object.keys(state.products).length} produit(s) mémorisé(s) par code-barres · {Object.keys(state.aliases).length} libellé(s) de ticket appris · {state.customRecipes.length} recette(s)
        gardée(s).
      </p>
      <p className="muted small">Popote retient vos corrections de tickets pour reconnaître les abréviations du magasin la fois suivante.</p>
      <button className="btn block" disabled={Object.keys(state.aliases).length === 0} onClick={() => confirm('Oublier les libellés de ticket appris ?') && dispatch({ type: 'clearAliases' })}>
        Oublier les libellés appris
      </button>
    </section>
  );
}

function BackupCard() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
      setMsg('✓ Sauvegarde importée.');
    } catch (e) {
      setMsg(`Import impossible : ${(e as Error).message}`);
    }
  };
  return (
    <>
      <section className="card">
        <p className="small">Les données restent sur ce téléphone. Exportez régulièrement un fichier (changement de téléphone, effacement des données Safari).</p>
        <button className="btn primary block" onClick={doExport}>
          Exporter (JSON)
        </button>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          Importer une sauvegarde…
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
        {msg && <p className="note info">{msg}</p>}
      </section>
      <section className="card">
        <p className="muted small">Efface planning, profils, frigo, placard et prix de cet appareil.</p>
        <button className="btn danger block" onClick={() => confirm('Tout réinitialiser ? Cette action est définitive.') && dispatch({ type: 'reset' })}>
          Réinitialiser l’application
        </button>
      </section>
    </>
  );
}

function AboutCard() {
  const { state, dispatch } = useStore();
  return (
    <>
      <section className="card">
        <h3>Repères nutritionnels</h3>
        <Toggle
          checked={state.settings.showNutrition}
          onChange={(v) => dispatch({ type: 'updateSettings', patch: { showNutrition: v } })}
          label="Afficher les calories et protéines estimées sur les recettes"
        />
        <ul className="plain small">
          <li>• Popote ne fixe pas d’objectif calorique : il manque l’activité réelle, le sommeil, la faim…</li>
          <li>• Une assiette avec environ ½ légumes, ¼ protéines, ¼ féculents ; les féculents s’ajustent à l’activité plutôt que de disparaître.</li>
          <li>• Les jours de chantier très physiques, augmentez la portion du midi (×1,25) : ce n’est pas un écart.</li>
          <li>• Pour un objectif chiffré, un médecin ou un·e diététicien·ne peut le personnaliser.</li>
        </ul>
      </section>
      <section className="card">
        <h3>Transport et conservation</h3>
        <ul className="plain small">
          <li>• Un sac isotherme ne produit pas de froid : ajoutez au moins 2 pains de glace, collez la boîte contre eux et gardez le sac à l’ombre.</li>
          <li>• Sans réfrigérateur sur place, un aliment périssable ne devrait pas rester plus de 2 h hors du froid (1 h au-dessus de 32 °C).</li>
          <li>• Refroidir les plats cuisinés en moins de 2 h avant le réfrigérateur (4 °C maximum).</li>
          <li>• Décongeler au réfrigérateur la veille ; réchauffer une seule fois, bien chaud à cœur.</li>
          <li>• Les durées indiquées sont prudentes : en cas de doute (odeur, aspect), ne pas consommer.</li>
        </ul>
      </section>
      <section className="card">
        <h3>Valeurs supposées</h3>
        <ul className="plain small">
          {ASSUMPTIONS.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3>Sources</h3>
        <ul className="plain small">
          <li>
            • Nutrition :{' '}
            <a href={NUTRITION_SOURCE.url} target="_blank" rel="noreferrer">
              {NUTRITION_SOURCE.name}
            </a>{' '}
            ({NUTRITION_SOURCE.licence}).
          </li>
          <li>
            • Prix moyens :{' '}
            <a href={INSEE_SOURCE.url} target="_blank" rel="noreferrer">
              INSEE
            </a>
            . Produits : Open Food Facts, Open Prices. Recettes du monde : TheMealDB.
          </li>
        </ul>
      </section>
    </>
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
    <>
      <section className="card">
        <p className="muted small">Ce que vous avez toujours : « en stock » n’apparaît jamais dans la liste de courses ; avec une quantité, elle est déduite du besoin.</p>
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
          <div className="row gap wrap" style={{ marginTop: 8 }}>
            <input className="narrow" inputMode="decimal" placeholder="Qté" value={qty} onChange={(e) => setQty(e.target.value)} />
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
      <div className="list">
        {items.map((p) => (
          <ListRow key={p.ingredientId} label={CATALOG.ingredients[p.ingredientId].name} detail={p.qty === null ? 'en stock' : formatAmount(p.qty, p.unit)}>
            <button className="btn-link" onClick={() => dispatch({ type: 'removePantryItem', ingredientId: p.ingredientId })}>
              Retirer
            </button>
          </ListRow>
        ))}
      </div>
    </>
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
  const [catalogReport, setCatalogReport] = useState<CatalogImportResult | null>(null);

  const runImport = (csv: string) => {
    if (isStoreCatalogCsv(csv)) {
      const r = importStoreCatalog(csv, CATALOG, state.aliases, store, todayIso());
      dispatch({ type: 'replaceCatalogPrices', store, entries: r.entries });
      setCatalogReport(r);
      setReport([
        `Catalogue ${STORE_LABELS[store]} : ${r.rows} produits lus, ${r.foodRows} alimentaires, ${r.matchedRows} rattachés à ${r.entries.length} ingrédients (prix médian). L’import précédent de ce magasin est remplacé.`,
      ]);
      return;
    }
    setCatalogReport(null);
    const { entries, errors } = parsePriceCsv(csv, CATALOG, state.aliases, store, todayIso());
    if (entries.length) dispatch({ type: 'addPrices', entries });
    setReport([`${entries.length} prix importé(s).`, ...errors.slice(0, 8), ...(errors.length > 8 ? [`… et ${errors.length - 8} autre(s) ligne(s) ignorée(s).`] : [])]);
    if (entries.length) setText('');
  };

  return (
    <>
      <section className="card">
        <p className="muted small">
          Le budget indicatif a été retiré des courses. Vos relevés (tickets scannés, imports de catalogue) restent enregistrés ici, par magasin, pour une future comparaison.
        </p>
        {sorted.length === 0 ? (
          <p className="small">Aucun relevé.</p>
        ) : (
          <>
            <ul className="plain small">
              {shown.map((p) => (
                <li key={p.id}>
                  {CATALOG.ingredients[p.ingredientId].name} — {STORE_LABELS[p.store]} : {formatEuro(p.price)} / {p.perQty} {p.perUnit}{' '}
                  <span className="muted">
                    ({new Date(p.date).toLocaleDateString('fr-FR')}, {SOURCE_LABELS[p.source ?? 'saisie']})
                  </span>
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
      </section>
      <section className="card">
        <h3>Importer des relevés</h3>
        <p className="muted small">CSV ou copier-coller, une ligne par prix : produit ; prix ; quantité ; unité ; magasin ; date. Un export de catalogue magasin (category, brand, name, size, price…) est aussi reconnu.</p>
        <textarea rows={4} value={text} placeholder={'Courgettes;2,49;1;kg\nLait demi-écrémé;1,05;1;l;Auchan'} onChange={(e) => setText(e.target.value)} />
        <select value={store} onChange={(e) => setStore(e.target.value as StoreId)} aria-label="Magasin par défaut" style={{ marginTop: 8 }}>
          {(Object.keys(STORE_LABELS) as StoreId[]).map((st) => (
            <option key={st} value={st}>
              {STORE_LABELS[st]} (par défaut)
            </option>
          ))}
        </select>
        <div className="action-row">
          <button className="btn primary" disabled={!text.trim()} onClick={() => runImport(text)}>
            Importer le texte
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Fichier CSV…
          </button>
        </div>
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
        {report && (
          <ul className="plain small note info">
            {report.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {catalogReport && (
          <details className="small">
            <summary>Détail par ingrédient ({catalogReport.summary.length})</summary>
            <table className="qty-table">
              <thead>
                <tr>
                  <th>Ingrédient</th>
                  <th>Prix médian</th>
                  <th>Produits</th>
                </tr>
              </thead>
              <tbody>
                {catalogReport.summary.map((r) => (
                  <tr key={r.ingredientId} title={r.examples.join(' · ')}>
                    <td>{CATALOG.ingredients[r.ingredientId].name}</td>
                    <td>
                      {formatEuro(r.price)} / {r.perUnit === 'pc' ? 'pièce' : r.perUnit}
                    </td>
                    <td>{r.products}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </>
  );
}
