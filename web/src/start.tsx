import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ConfirmProvider } from './components/Confirm';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Le site lui-même, lancé par main.tsx une fois la langue chargée
export function start(root: HTMLElement) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
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
