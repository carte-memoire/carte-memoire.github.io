import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { familyLabel, genreName } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import type { Game, GenreInfo } from '../../lib/types';
import { Combobox } from '../../components/Combobox';
import { PsSymbol } from '../../components/PsSymbol';
import { tr } from '../../lib/i18n';

// Genres du jeu. Enregistrer marque le jeu « revu » : les imports automatiques
// (Wikipédia…) ne toucheront plus à ses genres.
export function GenreEditor({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const initial = game.game_genre.map((g) => g.genre);
  const [all, setAll] = useState<GenreInfo[]>([]);
  const [selected, setSelected] = useState<GenreInfo[]>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('genre').select('id, name, families').order('name').then(({ data }) => setAll((data as GenreInfo[]) ?? []));
  }, []);

  const chosen = new Set(selected.map((g) => g.id));
  const families = [...new Set(selected.flatMap((g) => g.families))];
  const changed = selected.length !== initial.length || initial.some((g) => !chosen.has(g.id));
  // Genres proposés à l'ajout, avec leurs familles (cherchées elles aussi : « stratégie » trouve Tactical RPG)
  const options = all
    .filter((g) => !chosen.has(g.id))
    .map((g) => ({ value: g.id, label: genreName(g.name), detail: g.families.length ? g.families.map(familyLabel).join(' + ') : tr('thème') }));

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    const before = new Set(initial.map((g) => g.id));
    const removed = initial.filter((g) => !chosen.has(g.id)).map((g) => g.id);
    const added = selected.filter((g) => !before.has(g.id)).map((g) => ({ game_id: game.id, genre_id: g.id }));
    try {
      if (removed.length) {
        const { error } = await supabase.from('game_genre').delete().eq('game_id', game.id).in('genre_id', removed);
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await supabase.from('game_genre').insert(added);
        if (error) throw error;
      }
      const { error } = await supabase.from('game').update({ genres_reviewed: true }).eq('id', game.id);
      if (error) throw error;
      setMessage(tr("Genres enregistrés. Le jeu est marqué « revu » : les imports automatiques n'y toucheront plus."));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form panel">
      <h2>{tr('Genres')}</h2>
      <p className="hint">
        {tr('Familles : ')}{families.length ? families.map(familyLabel).join(', ') : tr('aucune')}.{' '}
        {game.genres_reviewed ? tr('Genres déjà revus par un modérateur.') : tr("Pas encore revus : enregistrer (même sans changement) confirme qu'ils sont justes.")}
      </p>
      <ul className="genre-chips">
        {selected.map((g) => (
          <li key={g.id} className={g.families.length ? 'genre-chip' : 'genre-chip is-theme'}>
            {genreName(g.name)}
            <span className="muted small">{g.families.length ? g.families.map(familyLabel).join(' + ') : tr('thème')}</span>
            <button type="button" className="icon-button" aria-label={tr('Retirer {0}', g.name)} onClick={() => setSelected(selected.filter((x) => x.id !== g.id))}>✕</button>
          </li>
        ))}
        {selected.length === 0 && <li className="muted">{tr('Aucun genre.')}</li>}
      </ul>
      <Combobox
        label={tr('Ajouter un genre')}
        placeholder={tr('Tape pour chercher : plates-formes, stratégie, RPG…')}
        options={options}
        emptyText={tr('Aucun genre ne correspond')}
        onSelect={(o) => { const g = all.find((x) => x.id === o.value); if (g) setSelected([...selected, g]); }}
      />
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="button button-primary" onClick={save} disabled={saving || (!changed && game.genres_reviewed)}>
        <PsSymbol shape="cross" /> {changed ? tr('Enregistrer les genres') : tr('Confirmer : les genres sont justes')}
      </button>
    </section>
  );
}
