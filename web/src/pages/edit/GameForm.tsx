import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { DatePrecision, Game } from '../../lib/types';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';

// Titre, résumé et première sortie du jeu

export function GameForm({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const [title, setTitle] = useState(game.title);
  const [summary, setSummary] = useState(game.summary ?? '');
  const [date, setDate] = useState(game.first_release_date ?? '');
  const [precision, setPrecision] = useState<DatePrecision>(game.first_release_precision ?? 'day');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!title.trim()) return setError(tr('Le titre est obligatoire.'));
    // Conventions de la base : « mois » → le 1er du mois, « année » → le 1er janvier
    const normalized = !date ? null : precision === 'year' ? `${date.slice(0, 4)}-01-01` : precision === 'month' ? `${date.slice(0, 7)}-01` : date;
    // Un résumé modifié n'est plus celui de Wikipédia : on retire le lien source
    const newSummary = summary.trim() || null;
    const summaryChanged = newSummary !== (game.summary?.trim() || null);
    const { error } = await supabase.from('game').update({
      title: title.trim(),
      summary: newSummary,
      summary_source: summaryChanged || !newSummary ? null : game.summary_source,
      first_release_date: normalized,
      first_release_precision: normalized ? precision : null,
    }).eq('id', game.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setMessage(tr('Jeu enregistré.'));
    onSaved();
  }

  return (
    <form onSubmit={save} className="form panel">
      <h2>{tr('Le jeu')}</h2>
      <label className="field">
        <span className="field-label">{tr('Titre de référence')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label className="field">
        <span className="field-label">{tr('Résumé')}</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} maxLength={3000} />
        {game.summary_source && (
          <span className="hint">
            {tr('Texte actuel extrait de ')}<a href={game.summary_source} target="_blank" rel="noopener noreferrer">{tr('Wikipédia')}</a>{tr('. Le modifier en fait un texte de la communauté : le lien vers Wikipédia sera retiré.')}
          </span>
        )}
      </label>
      <div className="row">
        <label className="field">
          <span className="field-label">{tr('Première sortie (toutes plateformes)')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{tr('Précision')}</span>
          <select value={precision} onChange={(e) => setPrecision(e.target.value as DatePrecision)}>
            <option value="day">{tr('Jour exact')}</option>
            <option value="month">{tr('Mois')}</option>
            <option value="year">{tr('Année seulement')}</option>
          </select>
        </label>
      </div>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="button button-primary"><PsSymbol shape="cross" />{tr(' Enregistrer le jeu')}</button>
    </form>
  );
}
