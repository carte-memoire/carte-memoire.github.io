import { useInstall } from '../lib/install';
import { tr } from '../lib/i18n';

// « Installer Carte Mémoire sur ce téléphone » : proposé là où ça sert (le scanner),
// jusqu'à ce que ce soit fait ou que le membre dise non (lib/install.ts)
export function InstallHint() {
  const { state, hide } = useInstall();
  if (state.kind === 'installed' || state.kind === 'hidden' || state.kind === 'none') return null;
  return (
    <p className="install-hint" role="note">
      {state.kind === 'prompt' ? (
        <button type="button" className="link-button" onClick={state.install}>
          {tr('Installer Carte Mémoire sur cet appareil : l’icône sur l’écran d’accueil, le scanner en deux gestes.')}
        </button>
      ) : (
        <span>{tr('Pour avoir Carte Mémoire sur ton écran d’accueil : bouton Partager de Safari, puis « Sur l’écran d’accueil ».')}</span>
      )}
      <button type="button" className="icon-button" aria-label={tr('Ne plus proposer')} onClick={hide}>✕</button>
    </p>
  );
}
