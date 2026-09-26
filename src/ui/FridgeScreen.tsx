import { useMemo, useState } from 'react';
import type { InventoryItem, Recipe } from '../domain/types';
import { INGREDIENTS } from '../data/ingredients';
import { formatAmount } from '../domain/units';
import { todayIso, urgency, type Urgency } from '../domain/inventory';
import { generateIdeas, rankCatalog, type RankedRecipe, type StockUse } from '../domain/antigaspi';
import { useCatalog, useStore } from '../state/store';
import { Empty, ScreenHeader, Segmented, Sheet } from './common';
import { Icon } from './icons';
import { SwipeRow } from './SwipeRow';
import { BarcodeScanner } from './BarcodeScanner';
import { ReceiptScanner } from './ReceiptScanner';
import { ItemForm, LOCATION_LABELS, expiryLabel, formatDate } from './ItemForm';
import { RecipeDetail } from './RecipeDetail';

const GROUPS: { u: Urgency; title: string }[] = [
  { u: 'perime', title: 'Date dépassée' },
  { u: 'urgent', title: 'À manger d’ici 2 jours' },
  { u: 'bientot', title: 'Dans la semaine' },
  { u: 'ok', title: 'Plus tard' },
  { u: 'inconnu', title: 'Sans date' },
];

type Modal = null | 'barcode' | 'receipt' | 'add' | { edit: InventoryItem } | { idea: Recipe };

export function FridgeScreen() {
  const { state } = useStore();
  const [view, setView] = useState<'stock' | 'idees'>('stock');
  const [modal, setModal] = useState<Modal>(null);
  const today = todayIso();
  const counts = useMemo(() => {
    const c: Record<Urgency, number> = { perime: 0, urgent: 0, bientot: 0, ok: 0, inconnu: 0 };
    for (const i of state.inventory) c[urgency(i, today)]++;
    return c;
  }, [state.inventory, today]);

  return (
    <div className="screen">
      <ScreenHeader title="Frigo" subtitle={`${state.inventory.length} produit${state.inventory.length > 1 ? 's' : ''} suivis`} />
      <div className="tiles">
        <button className="tile" onClick={() => setModal('receipt')}>
          <span className="tile-icon">
            <Icon name="receipt" size={20} />
          </span>
          <span>
            Ticket
            <small>photo, PDF, texte</small>
          </span>
        </button>
        <button className="tile" onClick={() => setModal('barcode')}>
          <span className="tile-icon">
            <Icon name="barcode" size={20} />
          </span>
          <span>
            Code-barres
            <small>et date</small>
          </span>
        </button>
        <button className="tile" onClick={() => setModal('add')}>
          <span className="tile-icon">
            <Icon name="plus" size={20} />
          </span>
          <span>
            À la main
            <small>saisie rapide</small>
          </span>
        </button>
      </div>
      {(counts.urgent > 0 || counts.perime > 0) && (
        <button className="alert" style={{ width: '100%', textAlign: 'left', color: 'inherit' }} onClick={() => setView('idees')}>
          <span className="alert-num">{counts.urgent + counts.perime}</span>
          <span>
            {counts.urgent > 0 && `${counts.urgent} à manger d’ici 2 jours. `}
            {counts.perime > 0 && `${counts.perime} à date dépassée (DLC : ne pas consommer ; DDM : souvent encore bon). `}
            <strong>Voir les idées anti-gaspi ›</strong>
          </span>
        </button>
      )}

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'stock', label: `Stock (${state.inventory.length})` },
          { id: 'idees', label: 'Idées anti-gaspi' },
        ]}
      />

      {view === 'stock' ? <StockList onEdit={(i) => setModal({ edit: i })} /> : <Ideas onOpen={(r) => setModal({ idea: r })} />}

      {modal === 'barcode' && <BarcodeScanner onClose={() => setModal(null)} />}
      {modal === 'receipt' && <ReceiptScanner onClose={() => setModal(null)} />}
      {modal === 'add' && <AddSheet onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'edit' in modal && <EditSheet item={modal.edit} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'idea' in modal && <IdeaSheet recipe={modal.idea} onClose={() => setModal(null)} />}
    </div>
  );
}

function StockList({ onEdit }: { onEdit: (i: InventoryItem) => void }) {
  const { state, dispatch } = useStore();
  const today = todayIso();
  if (state.inventory.length === 0)
    return (
      <Empty icon="fridge" title="Frigo vide">
        Après les courses, importez le ticket (photo, PDF du drive ou texte) ou scannez les codes-barres : Popote suit les dates et propose des recettes pour ne rien jeter.
      </Empty>
    );
  const sorted = [...state.inventory].sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'));
  return (
    <div className="stack">
      {GROUPS.map((g) => {
        const items = sorted.filter((i) => urgency(i, today) === g.u);
        if (!items.length) return null;
        return (
          <section key={g.u}>
            <h2 className="aisle-title">{g.title}</h2>
            <ul className="shop-list">
              {items.map((i) => (
                <li key={i.id} className="shop-item">
                  <SwipeRow
                    leading={[{ label: 'Modifier', icon: 'pencil', color: '#2f80ed', onAction: () => onEdit(i) }]}
                    trailing={[{ label: 'Fini', icon: 'trash', color: '#e0352b', onAction: () => dispatch({ type: 'removeInventory', id: i.id }) }]}
                  >
                  <button className="stock-row" onClick={() => onEdit(i)}>
                    <span className={`dot ${urgency(i, today)}`} aria-hidden />
                    <span className="shop-label">
                      {i.label}
                      {i.ingredientId && INGREDIENTS[i.ingredientId].name !== i.label && <span className="muted small"> · {INGREDIENTS[i.ingredientId].name}</span>}
                    </span>
                    <span className={`expiry ${urgency(i, today)}`}>{expiryLabel(i.expiry, today)}</span>
                    <span className="shop-detail">
                      {formatAmount(i.qty, i.unit)} · {LOCATION_LABELS[i.location]}
                      {i.expiry && ` · ${formatDate(i.expiry)}${i.expirySource === 'estimee' ? ' (estimée)' : ''}`}
                      {!i.ingredientId && ' · non rattaché'}
                    </span>
                  </button>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function UsesLine({ uses, missing }: { uses: StockUse[]; missing: string[] }) {
  return (
    <>
      <p className="small">
        <strong>Utilise :</strong>{' '}
        {uses.map((u, k) => (
          <span key={u.ingredientId}>
            {k > 0 && ', '}
            {lowerFirst(INGREDIENTS[u.ingredientId].name)}
            {u.daysLeft !== null && u.daysLeft <= 5 && <span className={`expiry ${u.daysLeft <= 2 ? 'urgent' : 'bientot'}`}> {u.daysLeft <= 0 ? "aujourd'hui" : `J-${u.daysLeft}`}</span>}
          </span>
        ))}
      </p>
      {missing.length > 0 && <p className="small muted">À acheter : {missing.map((m) => lowerFirst(INGREDIENTS[m].name)).join(', ')}</p>}
    </>
  );
}

function Ideas({ onOpen }: { onOpen: (r: Recipe) => void }) {
  const { state } = useStore();
  const catalog = useCatalog();
  const [variant, setVariant] = useState(0);
  const today = todayIso();
  const ideas = useMemo(() => generateIdeas(catalog, state.inventory, today, state.settings, variant), [catalog, state.inventory, state.settings, today, variant]);
  const ranked: RankedRecipe[] = useMemo(() => rankCatalog(catalog, state.inventory, today, state.settings, 6), [catalog, state.inventory, state.settings, today]);

  if (state.inventory.length === 0)
    return (
      <Empty icon="leaf" title="Pas encore d’idées">
        Ajoutez des produits au stock : Popote composera des recettes avec ce qui périme en premier.
      </Empty>
    );
  return (
    <div className="stack">
      <section>
        <div className="row space-between">
          <h2 className="aisle-title">Recettes vide-frigo</h2>
          <button className="btn-link" onClick={() => setVariant((v) => v + 1)}>
            🔄 Autres idées
          </button>
        </div>
        <p className="muted small">Composées hors ligne à partir de votre stock, en commençant par ce qui périme. Gardez celles qui vous plaisent pour les planifier.</p>
        {ideas.length === 0 && <p className="muted small">Pas assez de produits à sauver pour composer une recette.</p>}
        <div className="stack">
          {ideas.map((i) => (
            <article key={i.recipe.id} className="card recipe-card">
              <button className="recipe-card-main" onClick={() => onOpen(i.recipe)}>
                <h3>{i.recipe.name}</h3>
                <UsesLine uses={i.uses} missing={i.missing} />
                <p className="meta">
                  <span>⏱ {i.recipe.activeMin} min actives</span>
                  {i.recipe.lunchbox && i.recipe.temperature !== 'chaud' && <span>🧊 boîte froide</span>}
                  {i.recipe.freezable && <span>❄️ congelable</span>}
                </p>
              </button>
            </article>
          ))}
        </div>
      </section>
      {ranked.length > 0 && (
        <section>
          <h2 className="aisle-title">Du catalogue, avec ce que vous avez</h2>
          <div className="stack">
            {ranked.map((r) => (
              <article key={r.recipe.id} className="card recipe-card">
                <button className="recipe-card-main" onClick={() => onOpen(r.recipe)}>
                  <h3>{r.recipe.name}</h3>
                  <UsesLine uses={r.uses} missing={r.missing} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IdeaSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const inCatalog = !!catalog.recipes[recipe.id];
  return (
    <Sheet title="Idée recette" onClose={onClose}>
      {!inCatalog && (
        <div className="card">
          <p className="small">Recette générée : gardez-la pour l’ajouter au planning (la liste de courses tiendra compte de votre stock).</p>
          <button className="btn primary block" onClick={() => dispatch({ type: 'keepRecipe', recipe })}>
            ★ Garder cette recette
          </button>
        </div>
      )}
      {inCatalog ? <RecipeDetail recipeId={recipe.id} /> : <RecipeDetail recipe={recipe} hidePlanning />}
      {inCatalog && /^(vf|mdb|imp)-/.test(recipe.id) && (
        <button
          className="btn danger block"
          disabled={Object.values(state.plan.slots).some((s) => s.recipeId === recipe.id)}
          onClick={() => {
            dispatch({ type: 'removeCustomRecipe', id: recipe.id });
            onClose();
          }}
        >
          Oublier cette recette
        </button>
      )}
    </Sheet>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [added, setAdded] = useState<string[]>([]);
  return (
    <Sheet title="Ajouter au stock" onClose={onClose}>
      {added.length > 0 && <p className="note ok">✓ Ajouté : {added.join(', ')}</p>}
      <ItemForm
        key={added.length}
        initial={{}}
        saveLabel="Ajouter"
        onSave={(item) => {
          dispatch({ type: 'addInventory', items: [item] });
          setAdded((a) => [...a, item.label]);
        }}
      />
    </Sheet>
  );
}

function EditSheet({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { dispatch } = useStore();
  return (
    <Sheet title={item.label} onClose={onClose}>
      <p className="muted small">Pour une partie seulement utilisée, modifiez la quantité restante.</p>
      <ItemForm
        initial={item}
        onSave={(next) => {
          dispatch({ type: 'updateInventory', id: item.id, patch: next });
          onClose();
        }}
        onDelete={() => {
          dispatch({ type: 'removeInventory', id: item.id });
          onClose();
        }}
      />
    </Sheet>
  );
}
