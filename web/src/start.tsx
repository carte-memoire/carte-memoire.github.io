import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/Confirm';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { basePath } from './lib/i18n';

// Le site lui-même, lancé par main.tsx une fois la langue chargée
export function start(root: HTMLElement) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        {/* En anglais, toutes les adresses commencent par /en : le routeur l'ajoute à chaque lien */}
        <BrowserRouter basename={basePath || undefined}>
          <AuthProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
}
