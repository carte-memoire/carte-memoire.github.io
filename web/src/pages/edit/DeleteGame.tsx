import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { Game } from '../../lib/types';
import { Dialog } from '../../components/Dialog';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';
import { removeCovers } from './covers';

// Zone dangereuse : suppression définitive, avec le titre à retaper pour confirmer
export function DeleteGame({ game, onDeleted }: { game: Game; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const images = game.release.reduce((n, r) => n + r.image.length, 0);

  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('delete_game', { target_game: game.id, reason: reason.trim() || null });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    await removeCovers(data as string[]);
    onDeleted();
  }

  return (
    <section className="panel danger-zone">
      <h2>{tr('Zone dangereuse')}</h2>
      <p className="muted">
        {tr('Supprimer ce jeu efface aussi ses ')}{game.release.length}{tr(' version{0?s} et ', game.release.length > 1)}{images}{tr(" image{0?s}. C'est impossible si un membre l'a dans sa collection : pour un doublon, utilise plutôt la fusion (Modération → Doublons).", images > 1)}
      </p>
      <button type="button" className="button button-danger" onClick={() => { setOpen(true); setTyped(''); setError(''); }}>{tr('Supprimer ce jeu…')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Supprimer ce jeu')}>
        <form onSubmit={remove} className="form">
          <p className="warning">
            {tr('Suppression ')}<strong>{tr('définitive')}</strong>{tr(' de « ')}{game.title}{tr(' », de ses versions, dates, images et genres. Elle sera notée dans le journal des suppressions.')}
          </p>
          <label className="field">
            <span className="field-label">{tr('Motif (facultatif)')}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={tr('Jeu inexistant, doublon sans exemplaire…')} />
          </label>
          <label className="field">
            <span className="field-label">{tr('Pour confirmer, tape le titre exact : ')}{game.title}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={() => setOpen(false)}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-danger" disabled={busy || typed.trim() !== game.title.trim()}>
              {busy ? tr('Suppression…') : tr('Supprimer définitivement')}
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
