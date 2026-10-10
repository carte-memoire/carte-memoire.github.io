import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { REPORT_KINDS, zoneLabel } from '../lib/format';
import { errorMessage } from '../lib/errors';
import type { Game, ReportKind } from '../lib/types';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';

// « Signaler une erreur » sur la fiche d'un jeu : un modérateur la corrigera
export function ReportDialog({ game, open, onClose }: { game: Game; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind>('genre');
  const [releaseId, setReleaseId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) return setError('Décris l\'erreur en quelques mots (10 caractères au moins).');
    setBusy(true);
    setError('');
    const { error } = await supabase.from('report').insert({
      game_id: game.id, release_id: releaseId ? Number(releaseId) : null, kind, message: message.trim(),
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setSent(true);
  }

  function close() {
    onClose();
    setSent(false);
    setMessage('');
    setReleaseId('');
  }

  return (
    <Dialog open={open} onClose={close} title={`Signaler une erreur : ${game.title}`}>
      {sent ? (
        <>
          <p className="success">Merci ! Un modérateur va vérifier. Tu suivras la réponse dans « Mes propositions ».</p>
          <div className="actions">
            <Link to="/mes-propositions" className="button" onClick={close}>Mes propositions</Link>
            <button type="button" className="button button-primary" onClick={close}><PsSymbol shape="cross" /> Fermer</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span className="field-label">Qu'est-ce qui est faux ?</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
              {REPORT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          {game.release.length > 1 && (
            <label className="field">
              <span className="field-label">Version concernée (facultatif)</span>
              <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
                <option value="">Le jeu en général</option>
                {game.release.map((r) => (
                  <option key={r.id} value={r.id}>{r.local_title} · {zoneLabel(r.zone)}{r.product_code ? ` · ${r.product_code}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">Explique (et donne ta source si tu en as une)</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} required data-autofocus=""
              placeholder="Ex. : c'est un jeu de plates-formes, pas un RPG (voir la notice / Wikipédia…)" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={close}><PsSymbol shape="circle" /> Annuler</button>
            <button type="submit" className="button button-primary" disabled={busy}><PsSymbol shape="cross" /> Envoyer</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
