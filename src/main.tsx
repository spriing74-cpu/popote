import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { StoreProvider } from './state/store';
import { App } from './App';
// Police « matrice de points » du thème Nothing (auto-hébergée, disponible hors ligne).
import '@fontsource/doto/latin-900.css';
import './styles.css';

// Service worker : met l'application en cache pour un usage hors ligne.
registerSW({ immediate: true });

// Demande un stockage persistant (limite le risque d'effacement automatique par le navigateur).
if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
