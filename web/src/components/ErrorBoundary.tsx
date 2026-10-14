import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Filet de sécurité : une erreur imprévue dans une page affiche un message et un bouton
// pour recharger, au lieu d'effacer tout le site (page vide, seulement le fond)
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel narrow center" role="alert">
        <h1>{tr('Erreur de lecture')}</h1>
        <p>{tr("Cette page n'a pas pu s'afficher. Le site vient peut-être d'être mis à jour : recharge la page.")}</p>
        <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
          <PsSymbol shape="cross" />{tr(' Recharger la page')}
        </button>
      </section>
    );
  }
}
