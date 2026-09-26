import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { StoreProvider } from './state/store';
import { App } from './App';
import { DialogProvider } from './ui/dialog';
import { TimersProvider } from './ui/timers';
// Police « matrice de points » du thème Nothing (auto-hébergée, disponible hors ligne).
import '@fontsource/doto/latin-900.css';
// Polices du thème Liquid Glass : Geist (texte) et Instrument Serif (titres).
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './styles.css';

// Service worker : met l'application en cache pour un usage hors ligne.
registerSW({ immediate: true });

// Demande un stockage persistant (limite le risque d'effacement automatique par le navigateur).
if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <DialogProvider>
        <TimersProvider>
          <App />
        </TimersProvider>
      </DialogProvider>
    </StoreProvider>
  </StrictMode>,
);
