import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AisleId, StoreId } from '../domain/types';
import { AISLE_LABELS, AISLE_ORDER } from '../data/aisles';
import { STORE_LABELS } from '../domain/budget';
import { groupByAisle, type ShoppingItem } from '../domain/shopping';
import { completeOrder, mergeVisit, moveAisle } from '../domain/storeOrder';
import { useStore } from '../state/store';
import { Sheet } from './common';
import { Icon } from './icons';
import { SwipeRow } from './SwipeRow';
import { useDialog } from './dialog';
import { haptic, useWakeLock } from './ios';

export function storeKey(store: StoreId | null): StoreId {
  return store ?? 'autre';
}

export function useAisleOrder(): { store: StoreId; order: AisleId[] } {
  const { state } = useStore();
  const store = storeKey(state.settings.preferredStore);
  return { store, order: completeOrder(state.settings.aisleOrders[store], AISLE_ORDER) };
}

/** Réglage manuel de l'ordre des rayons du magasin choisi. */
export function AisleOrderSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { store, order } = useAisleOrder();
  const save = (next: AisleId[]) => {
    haptic('light');
    dispatch({ type: 'updateSettings', patch: { aisleOrders: { ...state.settings.aisleOrders, [store]: next } } });
  };
  return (
    <Sheet title={`Rayons — ${STORE_LABELS[store]}`} onClose={onClose}>
      <p className="small muted">
        Dans l’ordre où vous les parcourez. Popote l’apprend aussi tout seul : en mode magasin, l’ordre dans lequel vous cochez les rayons vous sera proposé à la fin.
      </p>
      <div className="list">
        {order.map((a, i) => (
          <div key={a} className="list-row">
            <span className="aisle-rank">{i + 1}</span>
            <span className="row-text">
              <span className="row-label">{AISLE_LABELS[a]}</span>
            </span>
            <button className="icon-btn" disabled={i === 0} onClick={() => save(moveAisle(order, a, -1))} aria-label={`Monter ${AISLE_LABELS[a]}`}>
              <Icon name="chevron" size={18} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => save(moveAisle(order, a, 1))} aria-label={`Descendre ${AISLE_LABELS[a]}`}>
              <Icon name="chevron" size={18} style={{ transform: 'rotate(90deg)' }} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn block" onClick={() => save(AISLE_ORDER)}>
        Revenir à l’ordre par défaut
      </button>
    </Sheet>
  );
}

/**
 * Mode magasin : gros texte, écran allumé, rayons dans l'ordre du magasin, ce qui est pris
 * descend dans « Dans le panier ». On coche d'un toucher ou d'un balayage vers la droite.
 */
export function StoreMode({ items, onClose }: { items: ShoppingItem[]; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const dialog = useDialog();
  const { store, order } = useAisleOrder();
  const [showBasket, setShowBasket] = useState(false);
  const visited = useRef<AisleId[]>([]);
  useWakeLock(true);

  const todo = items.filter((i) => !state.checked[i.key]);
  const done = items.filter((i) => state.checked[i.key]);
  const groups = groupByAisle(todo, order);

  const toggle = (item: ShoppingItem) => {
    const checking = !state.checked[item.key];
    haptic(checking ? 'medium' : 'light');
    if (checking && !visited.current.includes(item.aisle)) visited.current.push(item.aisle);
    dispatch({ type: 'toggleChecked', key: item.key });
  };

  const finish = async () => {
    const learned = mergeVisit(order, visited.current);
    if (learned.join() !== order.join()) {
      const ok = await dialog.confirm({
        title: `Retenir votre parcours chez ${STORE_LABELS[store]} ?`,
        message: `Rayons dans l’ordre : ${visited.current.map((a) => AISLE_LABELS[a].split(' ')[0].toLowerCase()).join(' → ')}. La prochaine liste suivra cet ordre.`,
        confirmLabel: 'Retenir cet ordre',
      });
      if (ok) dispatch({ type: 'updateSettings', patch: { aisleOrders: { ...state.settings.aisleOrders, [store]: learned } } });
    }
    onClose();
  };

  return createPortal(
    <div className="store-mode" role="dialog" aria-modal="true" aria-label="Mode magasin" onClick={(e) => e.stopPropagation()}>
      <header className="store-head">
        <button className="icon-btn" onClick={finish} aria-label="Terminer">
          <Icon name="close" />
        </button>
        <div className="store-title">
          <b>{STORE_LABELS[store]}</b>
          <span>
            {todo.length ? `${todo.length} à prendre` : 'Tout est pris'} · {done.length}/{items.length}
          </span>
        </div>
        <span className="store-count">{items.length ? Math.round((done.length / items.length) * 100) : 0} %</span>
      </header>
      <div className="progress store-progress" aria-hidden>
        <span style={{ width: `${items.length ? (done.length / items.length) * 100 : 0}%` }} />
      </div>

      <div className="store-body">
        {todo.length === 0 && (
          <div className="store-done">
            <p className="cook-end-emoji" aria-hidden>
              🛒
            </p>
            <p className="cook-step">Tout est dans le panier !</p>
            <button className="btn primary block" onClick={finish}>
              Terminer les courses
            </button>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.aisle}>
            <h2 className="store-aisle">{AISLE_LABELS[g.aisle]}</h2>
            <ul className="shop-list store-list">
              {g.items.map((i) => (
                <li key={i.key} className="shop-item">
                  <SwipeRow leading={[{ label: 'Pris', icon: 'check', color: '#1f9d55', onAction: () => toggle(i) }]}>
                    <button className="store-row" onClick={() => toggle(i)}>
                      <span className="store-check" aria-hidden />
                      <span className="store-label">{i.label}</span>
                      <span className="store-qty">{i.display}</span>
                    </button>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {done.length > 0 && (
          <section>
            <button className="store-basket-toggle" onClick={() => setShowBasket((v) => !v)}>
              Dans le panier ({done.length}) <Icon name="chevron" size={16} style={{ transform: showBasket ? 'rotate(90deg)' : undefined }} />
            </button>
            {showBasket && (
              <ul className="shop-list store-list basket">
                {done.map((i) => (
                  <li key={i.key} className="shop-item checked">
                    <button className="store-row" onClick={() => toggle(i)}>
                      <span className="store-check on" aria-hidden>
                        <Icon name="check" size={16} />
                      </span>
                      <span className="store-label">{i.label}</span>
                      <span className="store-qty">{i.display}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}
