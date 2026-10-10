import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/press-start-2p/400.css';
import './styles.css';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/Confirm';
import { App } from './App';

const root = document.getElementById('root')!;

// Protection contre le « clickjacking » : un autre site qui afficherait Carte Mémoire
// dans un cadre invisible pour faire cliquer à son insu (supprimer, valider…) n'obtient
// qu'un lien. D'habitude un en-tête HTTP s'en charge, mais GitHub Pages ne permet pas
// d'en ajouter. Seulement sur le site publié : l'aperçu de développement peut utiliser un cadre.
if (import.meta.env.PROD && window.top !== window.self) {
  const link = document.createElement('a');
  link.href = window.location.href;
  link.target = '_top';
  link.rel = 'noopener';
  link.textContent = 'Ouvrir Carte Mémoire dans son propre onglet';
  root.append(link);
} else {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
