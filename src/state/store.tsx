import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { AppState, Catalog } from '../domain/types';
import { CATALOG, mergeCatalog } from '../data/catalog';
import { reducer, type Action } from './reducer';
import { loadState, saveState } from './persistence';

interface Store {
  state: AppState;
  dispatch: (a: Action) => void;
  saveError: boolean;
  /** Catalogue de base + recettes vide-frigo gardées. */
  catalog: Catalog;
}

const Ctx = createContext<Store | null>(null);
const reduce = reducer(CATALOG);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => loadState(CATALOG));
  const [saveError, setSaveError] = useState(false);
  const first = useRef(true);

  // Sauvegarde automatique (légèrement différée pour regrouper les modifications rapides).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => setSaveError(!saveState(state)), 200);
    return () => window.clearTimeout(t);
  }, [state]);

  // Sauvegarde immédiate quand l'app passe en arrière-plan (iOS peut la fermer ensuite).
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') saveState(latest.current);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const catalog = useMemo(() => mergeCatalog(CATALOG, state.customRecipes), [state.customRecipes]);
  const value = useMemo(() => ({ state, dispatch, saveError, catalog }), [state, saveError, catalog]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}

export function useCatalog(): Catalog {
  return useStore().catalog;
}
