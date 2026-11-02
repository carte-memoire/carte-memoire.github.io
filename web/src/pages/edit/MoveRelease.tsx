import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { zoneLabel } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import type { Release, SearchResult } from '../../lib/types';
import { Dialog } from '../../components/Dialog';
import { GameSearch } from '../../components/GameSearch';
import { useConfirm } from '../../components/Confirm';
import { tr } from '../../lib/i18n';

// Version rattachée au mauvais jeu : on la déplace (les exemplaires des membres suivent)
export function MoveRelease({ release, onMoved }: { release: Release; onMoved: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  async function move(target: SearchResult) {
    setError('');
    if (target.id === release.game_id) return setError(tr('Cette version appartient déjà à ce jeu.'));
    if (!(await confirm({
      title: tr('Déplacer cette version'),
      message: tr('« {0} » ({1}) rejoindra « {2} », avec ses images, ses dates et les exemplaires des membres.', release.local_title, zoneLabel(release.zone), target.title),
      confirmLabel: tr('Déplacer'),
    }))) return;
    const { error } = await supabase.rpc('move_release', { target_release: release.id, to_game: target.id });
    if (error) return setError(errorMessage(error));
    setOpen(false);
    onMoved();
  }

  return (
    <>
      <button type="button" className="button button-small" onClick={() => { setOpen(true); setError(''); }}>{tr('Déplacer vers un autre jeu…')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Déplacer « {0} »', release.local_title)}>
        <GameSearch onSelect={move} autoFocus label={tr('Vers quel jeu ? (titre ou code produit)')} />
        {error && <p className="error" role="alert">{error}</p>}
      </Dialog>
    </>
  );
}
