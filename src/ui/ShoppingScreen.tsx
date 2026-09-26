import { useMemo, useState } from 'react';
import type { AisleId } from '../domain/types';
import { AISLE_LABELS, AISLE_ORDER } from '../data/aisles';
import { planConsumption } from '../domain/portions';
import { buildShoppingList, groupByAisle, type ShoppingItem } from '../domain/shopping';
import { slotLabel } from '../domain/week';
import { inventoryAsPantry, todayIso } from '../domain/inventory';
import { useCatalog, useStore } from '../state/store';
import { Chip, Empty, IconButton, ScreenHeader, uid } from './common';
import { Icon } from './icons';

/** Liste de courses calculée depuis le planning (partagée avec le badge de l'onglet). */
export function useShoppingList() {
  const { state } = useStore();
  const catalog = useCatalog();
  return useMemo(() => {
    const stock = state.settings.deductInventory ? inventoryAsPantry(state.inventory, catalog, todayIso()) : [];
    return buildShoppingList(planConsumption(catalog, state.plan, state.profiles), catalog, [...state.pantry, ...stock], state.manualItems);
  }, [state.plan, state.profiles, state.pantry, state.manualItems, state.inventory, state.settings.deductInventory, catalog]);
}

export function ShoppingScreen() {
  const { state, dispatch } = useStore();
  const [hideChecked, setHideChecked] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [aisle, setAisle] = useState<AisleId>('divers');
  const [copied, setCopied] = useState(false);
  const [showCovered, setShowCovered] = useState(false);

  const list = useShoppingList();
  const groups = groupByAisle(list.items, AISLE_ORDER);
  const checkedCount = list.items.filter((i) => state.checked[i.key]).length;
  const total = list.items.length;

  const addManual = () => {
    const text = label.trim();
    if (!text) return;
    // « 2 éponges » → quantité « 2 », libellé « éponges ».
    const m = text.match(/^(\d+(?:[,.]\d+)?\s*(?:kg|g|l|cl|ml|x)?)\s+(.+)$/i);
    dispatch({ type: 'addManualItem', item: { id: uid(), label: m ? m[2] : text, quantity: m ? m[1] : '', aisle } });
    setLabel('');
  };

  const asText = () =>
    groups
      .map((g) => {
        const items = g.items.filter((i) => !state.checked[i.key]);
        return items.length ? `${AISLE_LABELS[g.aisle]}\n${items.map((i) => `- ${i.label}${i.display ? ` : ${i.display}` : ''}`).join('\n')}` : '';
      })
      .filter(Boolean)
      .join('\n\n');

  const share = async () => {
    const text = asText();
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses', text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="Courses"
        subtitle={total ? `${total - checkedCount} à prendre · ${checkedCount} dans le panier` : 'Liste vide'}
        actions={total > 0 && <IconButton icon="share" label="Partager la liste" onClick={share} />}
      />
      {total > 0 && (
        <div className="week-bar">
          <div className="progress" aria-hidden>
            <span style={{ width: `${(checkedCount / total) * 100}%` }} />
          </div>
          <span className="progress-label">{Math.round((checkedCount / total) * 100)} %</span>
        </div>
      )}

      <div className="add-bar">
        <input
          type="text"
          placeholder="Ajouter : « 2 éponges », café…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addManual()}
          aria-label="Article à ajouter"
        />
        <select value={aisle} onChange={(e) => setAisle(e.target.value as AisleId)} aria-label="Rayon">
          {AISLE_ORDER.map((a) => (
            <option key={a} value={a}>
              {AISLE_LABELS[a]}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={addManual} disabled={!label.trim()} aria-label="Ajouter">
          <Icon name="plus" />
        </button>
      </div>

      {copied && <p className="note ok">✓ Liste copiée.</p>}

      {total === 0 ? (
        <Empty icon="cart" title="Rien à acheter pour l’instant">
          Choisissez des repas dans Semaine : la liste se calcule toute seule, portions de chacun et restes compris, placard et frigo déduits.
        </Empty>
      ) : (
        <div className="chips">
          <Chip active={hideChecked} onClick={() => setHideChecked((v) => !v)}>
            Masquer ce qui est pris
          </Chip>
          {checkedCount > 0 && <Chip onClick={() => dispatch({ type: 'clearChecked' })}>Tout décocher</Chip>}
        </div>
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

      {list.covered.length > 0 && (
        <details className="fold" open={showCovered} onToggle={(e) => setShowCovered((e.target as HTMLDetailsElement).open)}>
          <summary>Déjà à la maison ({list.covered.length})</summary>
          <p className="muted small">Nécessaires au planning, mais disponibles dans le placard ou le frigo (non périmés). Vérifiez avant de partir.</p>
          <ul className="plain">
            {list.covered.map((c) => (
              <li key={c.key}>
                {c.label} <span className="muted small">({c.detail})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
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
            <button className="btn danger small" onClick={() => dispatch({ type: 'removeManualItem', id: item.key.replace('manuel:', '') })}>
              Supprimer cet article
            </button>
          ) : (
            <>
              <ul className="plain small">
                {item.sources.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong> — {s.slots.map((x) => slotLabel(state.plan, x).toLowerCase()).join(', ')}
                  </li>
                ))}
              </ul>
              <button
                className="btn small"
                onClick={() => item.ingredientId && dispatch({ type: 'setPantryItem', item: { ingredientId: item.ingredientId, qty: null, unit: item.unit } })}
              >
                J’en ai toujours (placard)
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
