import { useMemo, useState } from 'react';
import type { AisleId, StoreId, Unit } from '../domain/types';
import { AISLE_LABELS, AISLE_ORDER } from '../data/aisles';
import { planConsumption } from '../domain/portions';
import { buildShoppingList, groupByAisle, type ShoppingItem } from '../domain/shopping';
import { STORE_LABELS, compareStores, estimateBudget, formatEuro } from '../domain/budget';
import { slotLabel } from '../domain/week';
import { inventoryAsPantry, todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { Toggle, uid } from './common';

export function ShoppingScreen() {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const [hideChecked, setHideChecked] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [aisle, setAisle] = useState<AisleId>('divers');
  const [copied, setCopied] = useState(false);

  const list = useMemo(() => {
    const stock = state.settings.deductInventory ? inventoryAsPantry(state.inventory, catalog, todayIso()) : [];
    return buildShoppingList(planConsumption(catalog, state.plan, state.profiles), catalog, [...state.pantry, ...stock], state.manualItems);
  }, [state.plan, state.profiles, state.pantry, state.manualItems, state.inventory, state.settings.deductInventory, catalog]);
  const groups = groupByAisle(list.items, AISLE_ORDER);
  const checkedCount = list.items.filter((i) => state.checked[i.key]).length;
  const budget = estimateBudget(list.items, state.prices, catalog, state.settings.preferredStore);
  const comparison = compareStores(list.items, state.prices, catalog);

  const addManual = () => {
    if (!label.trim()) return;
    dispatch({ type: 'addManualItem', item: { id: uid(), label: label.trim(), quantity: quantity.trim(), aisle } });
    setLabel('');
    setQuantity('');
  };

  const asText = () =>
    groups
      .map((g) => `${AISLE_LABELS[g.aisle]}\n${g.items.filter((i) => !state.checked[i.key]).map((i) => `- ${i.label} : ${i.display}`).join('\n')}`)
      .join('\n\n');

  const share = async () => {
    const text = asText();
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses', text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="screen">
      <h1>Courses</h1>
      {list.items.length === 0 ? (
        <p className="empty">La liste est vide : choisissez des repas dans le Planning ou ajoutez un article ci-dessous.</p>
      ) : (
        <>
          <p className="muted">
            {list.items.length} articles · {checkedCount} dans le panier. Calculé depuis le planning réel (portions de chacun, convives présents, restes comptés une fois, placard{state.settings.deductInventory ? ' et frigo' : ''} déduits).
          </p>
          <div className="row gap wrap">
            <Toggle checked={hideChecked} onChange={setHideChecked} label="Masquer ce qui est pris" />
            <button className="btn" onClick={() => dispatch({ type: 'clearChecked' })} disabled={checkedCount === 0}>
              Tout décocher
            </button>
            <button className="btn" onClick={share}>
              Partager / copier
            </button>
          </div>
          {copied && <p className="note ok">✓ Liste copiée.</p>}
        </>
      )}

      {groups.map((g) => {
        const items = hideChecked ? g.items.filter((i) => !state.checked[i.key]) : g.items;
        if (items.length === 0) return null;
        return (
          <section key={g.aisle} className="aisle">
            <h2 className="aisle-title">{AISLE_LABELS[g.aisle]}</h2>
            <ul className="shop-list">
              {items.map((i) => (
                <ShopRow key={i.key} item={i} expanded={expanded === i.key} onExpand={() => setExpanded(expanded === i.key ? null : i.key)} />
              ))}
            </ul>
          </section>
        );
      })}

      <section className="card">
        <h3>Ajouter un article</h3>
        <input type="text" placeholder="ex. éponges, café, lessive" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="row gap">
          <input type="text" placeholder="Quantité (facultatif)" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <select value={aisle} onChange={(e) => setAisle(e.target.value as AisleId)}>
            {AISLE_ORDER.map((a) => (
              <option key={a} value={a}>
                {AISLE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn primary block" onClick={addManual} disabled={!label.trim()}>
          Ajouter
        </button>
      </section>

      {list.covered.length > 0 && (
        <section className="card">
          <h3>Déjà à la maison — à vérifier</h3>
          <p className="muted small">Nécessaires au planning, mais disponibles dans le placard ou le stock du frigo (non périmé).</p>
          <ul className="plain">
            {list.covered.map((c) => (
              <li key={c.key}>
                {c.label} <span className="muted">({c.detail})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Budget indicatif</h3>
        {budget.pricedCount === 0 ? (
          <p>Aucun prix saisi pour ces articles. Touchez un article puis « Saisir un prix » : seuls vos prix sont utilisés, aucun n’est inventé.</p>
        ) : (
          <>
            <p className="big">
              {formatEuro(budget.total)}
              <span className="muted small"> pour {budget.pricedCount} article(s) sur {budget.pricedCount + budget.missing.length}</span>
            </p>
            {budget.missing.length > 0 && <p className="muted small">Sans prix : {budget.missing.join(', ')}. Le total est donc incomplet.</p>}
            {budget.oldestDate && <p className="muted small">Prix saisis par vous, le plus ancien le {new Date(budget.oldestDate).toLocaleDateString('fr-FR')}.</p>}
          </>
        )}
        <h3>Comparer Auchan / E.Leclerc / Lidl</h3>
        {comparison.length < 2 ? (
          <p className="note info">
            Comparaison non disponible : l’application n’intègre aucune source de prix récente et localisée pour ces enseignes. Vous pouvez saisir vos propres relevés de prix par magasin ; la comparaison apparaîtra dès que deux magasins auront des prix.
          </p>
        ) : (
          <table className="qty-table">
            <thead>
              <tr>
                <th>Magasin</th>
                <th>Total connu</th>
                <th>Couverture</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c) => (
                <tr key={c.store}>
                  <td>{STORE_LABELS[c.store]}</td>
                  <td>{formatEuro(c.estimate.total)}</td>
                  <td>
                    {c.estimate.pricedCount}/{c.estimate.pricedCount + c.estimate.missing.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {comparison.length >= 2 && <p className="muted small">Uniquement vos relevés : les totaux ne sont comparables que si la couverture est identique.</p>}
      </section>
    </div>
  );
}

function ShopRow({ item, expanded, onExpand }: { item: ShoppingItem; expanded: boolean; onExpand: () => void }) {
  const { state, dispatch } = useStore();
  const checked = !!state.checked[item.key];
  return (
    <li className={checked ? 'shop-item checked' : 'shop-item'}>
      <div className="shop-row">
        <label className="shop-check">
          <input type="checkbox" checked={checked} onChange={() => dispatch({ type: 'toggleChecked', key: item.key })} aria-label={`${item.label} pris`} />
        </label>
        <button className="shop-text" onClick={onExpand} aria-expanded={expanded}>
          <span className="shop-label">{item.label}</span>
          <span className="shop-qty">{item.display}</span>
          {!item.manual && <span className="shop-detail">{item.detail}</span>}
        </button>
      </div>
      {expanded && (
        <div className="shop-more">
          {item.manual ? (
            <button className="btn danger" onClick={() => dispatch({ type: 'removeManualItem', id: item.key.replace('manuel:', '') })}>
              Supprimer cet article
            </button>
          ) : (
            <>
              <ul className="plain small">
                {item.sources.map((s) => (
                  <li key={s.name}>
                    {s.name} — {s.slots.map((x) => slotLabel(x).toLowerCase()).join(', ')}
                  </li>
                ))}
              </ul>
              <div className="row gap wrap">
                <button className="btn" onClick={() => item.ingredientId && dispatch({ type: 'setPantryItem', item: { ingredientId: item.ingredientId, qty: null, unit: item.unit } })}>
                  J’en ai déjà (placard)
                </button>
              </div>
              {item.ingredientId && <PriceForm ingredientId={item.ingredientId} />}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function PriceForm({ ingredientId }: { ingredientId: string }) {
  const { state, dispatch } = useStore();
  const catalog = useCatalog();
  const ing = catalog.ingredients[ingredientId];
  const defaultUnit: Unit = ing.unit === 'g' ? 'kg' : ing.unit === 'ml' ? 'l' : 'pc';
  const [store, setStore] = useState<StoreId>(state.settings.preferredStore ?? 'autre');
  const [price, setPrice] = useState('');
  const [perQty, setPerQty] = useState(ing.pack ? String(ing.pack.size) : '1');
  const [perUnit, setPerUnit] = useState<Unit>(ing.pack ? ing.unit : defaultUnit);
  const existing = state.prices.filter((p) => p.ingredientId === ingredientId);
  const units: Unit[] = ing.unit === 'pc' ? ['pc', ...(ing.pieceWeightG ? (['kg', 'g'] as Unit[]) : [])] : ing.unit === 'g' ? ['kg', 'g', ...(ing.pieceWeightG ? (['pc'] as Unit[]) : [])] : ['l', 'cl', 'ml'];

  const save = () => {
    const p = parseFloat(price.replace(',', '.'));
    const q = parseFloat(perQty.replace(',', '.'));
    if (!(p > 0) || !(q > 0)) return;
    dispatch({ type: 'addPrice', entry: { id: uid(), ingredientId, store, price: p, perQty: q, perUnit, date: new Date().toISOString().slice(0, 10) } });
    setPrice('');
  };

  return (
    <div className="price-form">
      {existing.length > 0 && (
        <ul className="plain small">
          {existing.map((p) => (
            <li key={p.id}>
              {STORE_LABELS[p.store]} : {formatEuro(p.price)} / {p.perQty} {p.perUnit} (relevé du {new Date(p.date).toLocaleDateString('fr-FR')})
              <button className="btn-link" onClick={() => dispatch({ type: 'removePrice', id: p.id })}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="small">
        <strong>Saisir un prix</strong> (votre relevé)
      </p>
      <div className="row gap wrap">
        <select value={store} onChange={(e) => setStore(e.target.value as StoreId)}>
          {(Object.keys(STORE_LABELS) as StoreId[]).map((s) => (
            <option key={s} value={s}>
              {STORE_LABELS[s]}
            </option>
          ))}
        </select>
        <input className="narrow" inputMode="decimal" placeholder="Prix €" value={price} onChange={(e) => setPrice(e.target.value)} />
        <span>pour</span>
        <input className="narrow" inputMode="decimal" value={perQty} onChange={(e) => setPerQty(e.target.value)} />
        <select value={perUnit} onChange={(e) => setPerUnit(e.target.value as Unit)}>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={save}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
