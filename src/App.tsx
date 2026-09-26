import { useEffect, useState } from 'react';
import { PlanningScreen } from './ui/PlanningScreen';
import { RecipesScreen } from './ui/RecipesScreen';
import { ShoppingScreen } from './ui/ShoppingScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { FridgeScreen } from './ui/FridgeScreen';
import { useStore } from './state/store';

type Tab = 'planning' | 'frigo' | 'recettes' | 'courses' | 'parametres';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'planning', label: 'Planning', icon: '📅' },
  { id: 'frigo', label: 'Frigo', icon: '🧊' },
  { id: 'recettes', label: 'Recettes', icon: '📖' },
  { id: 'courses', label: 'Courses', icon: '🛒' },
  { id: 'parametres', label: 'Réglages', icon: '⚙️' },
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

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { saveError } = useStore();

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
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
