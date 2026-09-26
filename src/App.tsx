import { useEffect, useMemo, useState } from 'react';
import { PlanningScreen } from './ui/PlanningScreen';
import { RecipesScreen } from './ui/RecipesScreen';
import { ShoppingScreen, useShoppingList } from './ui/ShoppingScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { FridgeScreen } from './ui/FridgeScreen';
import { Icon, type IconName } from './ui/icons';
import { useStore } from './state/store';
import { todayIso, urgency } from './domain/inventory';

export type Tab = 'planning' | 'frigo' | 'recettes' | 'courses' | 'parametres';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'planning', label: 'Semaine', icon: 'calendar' },
  { id: 'frigo', label: 'Frigo', icon: 'fridge' },
  { id: 'recettes', label: 'Recettes', icon: 'book' },
  { id: 'courses', label: 'Courses', icon: 'cart' },
  { id: 'parametres', label: 'Réglages', icon: 'settings' },
];

function initialTab(): Tab {
  try {
    const t = sessionStorage.getItem('popote:tab');
    if (t && TABS.some((x) => x.id === t)) return t as Tab;
  } catch {
    /* navigation privée */
  }
  return 'planning';
}

/** Applique le thème choisi (et le mode clair / sombre) à la page. */
function useTheme() {
  const { state } = useStore();
  const { theme, colorScheme } = state.settings;
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = colorScheme === 'dark' || (colorScheme === 'auto' && systemDark);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.scheme = dark ? 'dark' : 'light';
    const bg = theme === 'nothing' ? (dark ? '#000000' : '#efefef') : dark ? '#0c0d12' : '#f3f1f5';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [theme, dark]);
}

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { state, saveError } = useStore();
  useTheme();
  const list = useShoppingList();
  const today = todayIso();
  const badges = useMemo<Partial<Record<Tab, number>>>(
    () => ({
      frigo: state.inventory.filter((i) => ['urgent', 'perime'].includes(urgency(i, today))).length,
      courses: list.items.filter((i) => !state.checked[i.key]).length,
    }),
    [state.inventory, state.checked, list, today],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem('popote:tab', tab);
    } catch {
      /* ignoré */
    }
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="app">
      {saveError && (
        <div className="banner banner-error" role="alert">
          Sauvegarde locale impossible (stockage plein ou navigation privée). Exportez vos données dans Réglages.
        </div>
      )}
      <main className="content">
        {tab === 'planning' && <PlanningScreen goTo={setTab} />}
        {tab === 'frigo' && <FridgeScreen />}
        {tab === 'recettes' && <RecipesScreen />}
        {tab === 'courses' && <ShoppingScreen />}
        {tab === 'parametres' && <SettingsScreen />}
      </main>
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {!!badges[t.id] && tab !== t.id && <span className="tab-badge">{badges[t.id]! > 99 ? '99+' : badges[t.id]}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
