import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { Game, SearchResult, Zone } from '../../lib/types';
import { Dialog } from '../../components/Dialog';
import { GameSearch } from '../../components/GameSearch';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';

interface MergeCandidate {
  id: number;
  title: string;
  wikidata_id: string | null;
  release: { id: number; zone: Zone | null; product_code: string | null; image: { id: number }[] }[];
}

// Fusion avec un autre jeu (doublon que la détection automatique n'a pas vu,
// comme « Kagero: Deception 2 » et « Kagero: Deception II ») : les versions, donc
// les exemplaires des membres, les genres et les propositions passent sur le jeu gardé.
export function MergeGame({ game, onMerged }: { game: Game; onMerged: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState<[MergeCandidate, MergeCandidate] | null>(null);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(other: SearchResult) {
    setError('');
    if (other.id === game.id) return setError(tr('Choisis un autre jeu que celui-ci.'));
    const { data, error } = await supabase.from('game')
      .select('id, title, wikidata_id, release(id, zone, product_code, image(id))').in('id', [game.id, other.id]);
    if (error || !data || data.length !== 2) return setError(errorMessage(error) || tr('Jeu introuvable.'));
    const list = data as unknown as MergeCandidate[];
    const self = list.find((g) => g.id === game.id)!;
    const target = list.find((g) => g.id === other.id)!;
    setPair([self, target]);
    setForce(false);
    // Par défaut : garder la fiche reliée à Wikidata, sinon celle qui a le plus de versions, sinon l'autre
    const score = (g: MergeCandidate) => (g.wikidata_id ? 1000 : 0) + g.release.length;
    setKeepId(score(self) > score(target) ? self.id : target.id);
  }

  async function merge(e: FormEvent) {
    e.preventDefault();
    if (!pair || !keepId) return;
    const duplicate = pair.find((g) => g.id !== keepId)!;
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('merge_games', { keep_id: keepId, duplicate_id: duplicate.id, force });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOpen(false);
    if (keepId === game.id) onMerged();
    else navigate(`/jeu/${keepId}/modifier`);
  }

  const conflict = pair && pair[0].wikidata_id && pair[1].wikidata_id && pair[0].wikidata_id !== pair[1].wikidata_id;

  return (
    <section className="panel stack">
      <h2>{tr('Fusionner avec un autre jeu')}</h2>
      <p className="muted">
        {tr('Pour un doublon : les versions de la fiche supprimée (et donc les exemplaires des membres), ses genres, ses développeurs et ses propositions passent sur la fiche gardée. La fusion est définitive.')}
      </p>
      <div>
        <button type="button" className="button" onClick={() => { setOpen(true); setPair(null); setError(''); }}>
          <PsSymbol shape="square" />{tr(' Fusionner avec…')}
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Fusionner « {0} »', game.title)} wide>
        {!pair && (
          <>
            <GameSearch onSelect={choose} autoFocus label={tr('Avec quel jeu ? (titre ou code produit)')} />
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}
        {pair && (
          <form onSubmit={merge} className="form">
            <fieldset className="merge-choice">
              <legend className="field-label">{tr('Quelle fiche garder ?')}</legend>
              {pair.map((g) => (
                <label key={g.id} className={keepId === g.id ? 'merge-option active' : 'merge-option'}>
                  <input type="radio" name="keep" checked={keepId === g.id} onChange={() => setKeepId(g.id)} />
                  <span>
                    <strong>{g.title}</strong>{g.id === game.id && <span className="muted">{tr(' (cette fiche)')}</span>}
                    <span className="muted small">
                      {' '}{tr('· n° ')}{g.id} · {g.release.length}{tr(' version{0?s}', g.release.length > 1)}
                      {' '}({[...new Set(g.release.map((r) => r.zone ?? '?'))].join(', ')})
                      {g.wikidata_id ? tr(' · Wikidata {0}', g.wikidata_id) : tr(' · sans Wikidata')}
                    </span>
                    <span className="muted small"> {g.release.map((r) => r.product_code).filter(Boolean).join(', ')}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {conflict && (
              <label className="warning switch">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                {tr("Ces deux fiches sont reliées à des fiches Wikidata différentes : ce sont peut-être deux jeux distincts. Coche pour confirmer qu'il s'agit bien du même jeu.")}
              </label>
            )}
            <p className="warning">
              {tr('La fiche « ')}{pair.find((g) => g.id !== keepId)?.title}{tr(' » (n° ')}{pair.find((g) => g.id !== keepId)?.id}{tr(') disparaîtra : ses versions rejoignent « ')}{pair.find((g) => g.id === keepId)?.title} ».
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="button" onClick={() => setPair(null)}><PsSymbol shape="circle" />{tr(' Autre jeu')}</button>
              <button type="submit" className="button button-danger" disabled={busy || Boolean(conflict && !force)}>
                {busy ? tr('Fusion…') : tr('Fusionner')}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
