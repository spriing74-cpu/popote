import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PlanningScreen } from './ui/PlanningScreen';
import { RecipesScreen } from './ui/RecipesScreen';
import { ShoppingScreen, useShoppingList } from './ui/ShoppingScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { FridgeScreen } from './ui/FridgeScreen';
import { Icon, type IconName } from './ui/icons';
import { useStore } from './state/store';
import { todayIso, urgency } from './domain/inventory';
import { haptic, setBadge, setHapticsEnabled, withTransition } from './ui/ios';

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

/** La barre d'onglets se rétracte quand on descend, revient quand on remonte (iOS 26). */
function useMinimizedTabbar(): boolean {
  const [min, setMin] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 12) return;
      setMin(y > last && y > 120);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return min;
}

export function App() {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const { state, saveError } = useStore();
  useTheme();
  const minimized = useMinimizedTabbar();
  const scrolls = useRef<Partial<Record<Tab, number>>>({});

  useEffect(() => setHapticsEnabled(state.settings.haptics), [state.settings.haptics]);

  /** Changer d'onglet : transition fondue ; re-toucher l'onglet actif remonte en haut. */
  const setTab = (t: Tab) => {
    if (t === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    haptic('light');
    scrolls.current[tab] = window.scrollY;
    withTransition(() => flushSync(() => setTabState(t)));
  };
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
    // Chaque onglet retrouve sa position, comme dans une app iOS.
    window.scrollTo(0, scrolls.current[tab] ?? 0);
  }, [tab]);

  useEffect(() => {
    if (state.settings.appBadge) setBadge(badges.frigo ?? 0);
  }, [state.settings.appBadge, badges.frigo]);

  return (
    <div className="app">
      <div className="status-scrim" aria-hidden />
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
      <nav className={minimized ? 'tabbar minimized' : 'tabbar'} aria-label="Navigation principale">
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
