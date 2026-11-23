import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { editionLabel, genreDetail, genreName, LANGUAGES, ZONES, zoneLabel, zoneOrderFrom } from '../lib/format';
import { preferredZone } from '../lib/preferences';
import { errorMessage } from '../lib/errors';
import { gameChanges, PRODUCT_CODE, releaseChanges, type CorrectionChanges } from '../lib/corrections';
import { useCompanies } from '../lib/useCompanies';
import type { DatePrecision, Game, GenreInfo, Release, Zone } from '../lib/types';
import { Combobox } from './Combobox';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// « Suggérer une correction » : la date, les genres et les studios du jeu, ou la zone,
// le code produit et les langues d'une version. Seuls les champs changés partent ; un
// modérateur les vérifie (un membre de confiance les voit appliqués tout de suite).
export function SuggestCorrection({ game, initialReleaseId, onClose, onApplied }: {
  game: Game;
  initialReleaseId: number | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [target, setTarget] = useState(initialReleaseId ? String(initialReleaseId) : 'game');
  const [sent, setSent] = useState<'pending' | 'approved' | null>(null);
  const release = target === 'game' ? null : game.release.find((r) => r.id === Number(target)) ?? null;
  const multiPlatform = new Set(game.release.map((r) => r.platform.id)).size > 1;
  // Dans l'ordre de la fiche : la zone du visiteur d'abord, l'édition standard avant les rééditions
  const zoneRank = zoneOrderFrom(preferredZone());
  const releases = [...game.release].sort((a, b) => a.platform.id - b.platform.id || zoneRank(a.zone) - zoneRank(b.zone)
    || Number(b.edition_type === 'standard') - Number(a.edition_type === 'standard') || a.id - b.id);
  const releaseLabel = (r: Release) => [multiPlatform ? r.platform.short_name : null, r.local_title, zoneLabel(r.zone), editionLabel(r), r.product_code]
    .filter(Boolean).join(' · ');

  return (
    <Dialog open onClose={onClose} title={tr('Suggérer une correction')} wide>
      {sent ? (
        <div className="stack">
          {sent === 'approved'
            ? <p className="success">{tr('Merci ! Ta correction est déjà en ligne : tu es membre de confiance. Elle reste dans l’historique, où un modérateur peut la revoir.')}</p>
            : <p className="success">{tr('Merci ! Un modérateur va la vérifier. Tu suivras sa décision dans ')}<Link to="/mes-propositions" onClick={onClose}>{tr('Mes propositions')}</Link>.</p>}
          <div className="actions">
            <button type="button" className="button button-primary" onClick={onClose}><PsSymbol shape="cross" />{tr(' Fermer')}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="hint">{tr('Corrige ce qui est faux, directement dans les champs : seuls les champs que tu changes sont envoyés. Pour autre chose (titre, doublon…), utilise « Signaler une erreur ».')}</p>
          <label className="field">
            <span className="field-label">{tr('Que veux-tu corriger ?')}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="game">{tr('Le jeu : date de sortie, genres, studios')}</option>
              {releases.map((r) => <option key={r.id} value={r.id}>{tr('Une version : {0}', releaseLabel(r))}</option>)}
            </select>
          </label>
          {/* Changer de cible repart des valeurs actuelles de la nouvelle cible */}
          {release
            ? <ReleaseForm key={target} release={release} onSent={(status) => { setSent(status); if (status === 'approved') onApplied(); }} />
            : <GameForm key={target} game={game} onSent={(status) => { setSent(status); if (status === 'approved') onApplied(); }} />}
        </>
      )}
    </Dialog>
  );
}

type OnSent = (status: 'pending' | 'approved') => void;

// Envoi commun : la proposition, et si elle a été appliquée d'office
async function send(target: 'game' | 'release', id: number, changes: CorrectionChanges, sources: string): Promise<'pending' | 'approved'> {
  const { data, error } = await supabase.from('submission')
    .insert({ action: 'update', target, target_id: id, data: { changes }, sources: sources.trim() })
    .select('status').single();
  if (error) throw error;
  return (data as { status: string }).status === 'approved' ? 'approved' : 'pending';
}

function SourcesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{tr('Comment le sais-tu ?')}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={2000}
        placeholder={tr('Écrit sur ma boîte, sur la notice, sur le disque ; lien vers une source…')} />
    </label>
  );
}

function GameForm({ game, onSent }: { game: Game; onSent: OnSent }) {
  const companies = useCompanies();
  const [allGenres, setAllGenres] = useState<GenreInfo[]>([]);
  const [date, setDate] = useState(game.first_release_date ?? '');
  const [precision, setPrecision] = useState<DatePrecision>(game.first_release_precision ?? 'day');
  const [genres, setGenres] = useState<GenreInfo[]>(game.game_genre.map((g) => g.genre));
  const [studios, setStudios] = useState(game.game_developer.map((d) => d.company));
  const [sources, setSources] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10)); // pas de date dans le futur

  useEffect(() => {
    supabase.from('genre').select('id, name, families').order('name').then(({ data }) => setAllGenres((data as GenreInfo[]) ?? []));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const changes = gameChanges(
      { date: game.first_release_date, precision: game.first_release_precision, genreIds: game.game_genre.map((g) => g.genre.id), developerIds: game.game_developer.map((d) => d.company.id) },
      { date, precision, genreIds: genres.map((g) => g.id), developerIds: studios.map((s) => s.id) },
    );
    if (Object.keys(changes).length === 0) return setError(tr('Rien n’a changé : modifie au moins un champ.'));
    if (changes.genre_ids?.length === 0) return setError(tr('Garde au moins un genre.'));
    if (changes.developer_ids?.length === 0) return setError(tr('Garde au moins un studio.'));
    if (sources.trim().length < 5) return setError(tr('Dis en quelques mots comment tu le sais : le modérateur pourra vérifier.'));
    setBusy(true);
    setError('');
    try {
      onSent(await send('game', game.id, changes, sources));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const chosenGenres = new Set(genres.map((g) => g.id));
  const chosenStudios = new Set(studios.map((s) => s.id));
  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <label className="field">
          <span className="field-label">{tr('Première sortie (toutes consoles et régions)')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} />
        </label>
        <label className="field">
          <span className="field-label">{tr('Connue')}</span>
          <select value={precision} onChange={(e) => setPrecision(e.target.value as DatePrecision)}>
            <option value="day">{tr('au jour près')}</option>
            <option value="month">{tr('au mois près')}</option>
            <option value="year">{tr('à l’année près')}</option>
          </select>
        </label>
      </div>

      <div className="field">
        <span className="field-label">{tr('Genres')}</span>
        <ul className="genre-chips">
          {genres.map((g) => (
            <li key={g.id} className={g.families.length ? 'genre-chip' : 'genre-chip is-theme'}>
              {genreName(g.name)}
              <span className="muted small">{genreDetail(g)}</span>
              <button type="button" className="icon-button" aria-label={tr('Retirer {0}', genreName(g.name))} onClick={() => setGenres(genres.filter((x) => x.id !== g.id))}>✕</button>
            </li>
          ))}
          {genres.length === 0 && <li className="muted">{tr('Aucun genre.')}</li>}
        </ul>
        <Combobox
          label={tr('Ajouter un genre')}
          placeholder={tr('Tape pour chercher : plates-formes, stratégie, RPG…')}
          options={allGenres.filter((g) => !chosenGenres.has(g.id)).map((g) => ({ value: g.id, label: genreName(g.name), detail: genreDetail(g) }))}
          emptyText={tr('Aucun genre ne correspond')}
          onSelect={(o) => { const g = allGenres.find((x) => x.id === o.value); if (g && genres.length < 12) setGenres([...genres, g]); }}
        />
      </div>

      <div className="field">
        <span className="field-label">{tr('Studios de développement')}</span>
        <ul className="genre-chips">
          {studios.map((s) => (
            <li key={s.id} className="genre-chip">
              {s.name}
              <button type="button" className="icon-button" aria-label={tr('Retirer {0}', s.name)} onClick={() => setStudios(studios.filter((x) => x.id !== s.id))}>✕</button>
            </li>
          ))}
          {studios.length === 0 && <li className="muted">{tr('Aucun studio.')}</li>}
        </ul>
        <Combobox
          label={tr('Ajouter un studio')}
          placeholder={tr('Tape pour chercher : Naughty Dog, Squaresoft…')}
          options={companies.filter((c) => !chosenStudios.has(c.id)).map((c) => ({ value: c.id, label: c.name, detail: c.country ?? undefined }))}
          emptyText={tr('Studio inconnu du site : signale-le avec « Signaler une erreur »')}
          onSelect={(o) => { const c = companies.find((x) => x.id === o.value); if (c && studios.length < 10) setStudios([...studios, { id: c.id, name: c.name }]); }}
        />
      </div>

      <SourcesField value={sources} onChange={setSources} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={busy}><PsSymbol shape="cross" />{tr(' Envoyer la correction')}</button>
      </div>
    </form>
  );
}

function ReleaseForm({ release, onSent }: { release: Release; onSent: OnSent }) {
  const [zone, setZone] = useState<Zone | ''>(release.zone ?? '');
  const [code, setCode] = useState(release.product_code ?? '');
  const [languages, setLanguages] = useState<string[]>(release.languages ?? []);
  const [sources, setSources] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const changes = releaseChanges({ zone: release.zone, code: release.product_code, languages: release.languages ?? [] }, { zone, code, languages });
    if (Object.keys(changes).length === 0) return setError(tr('Rien n’a changé : modifie au moins un champ.'));
    if (changes.product_code && !PRODUCT_CODE.test(changes.product_code)) return setError(tr('Code produit invalide : lettres, chiffres et tirets, comme SCES-00867.'));
    if (sources.trim().length < 5) return setError(tr('Dis en quelques mots comment tu le sais : le modérateur pourra vérifier.'));
    setBusy(true);
    setError('');
    try {
      onSent(await send('release', release.id, changes, sources));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const toggle = (value: string) => setLanguages(languages.includes(value) ? languages.filter((l) => l !== value) : [...languages, value]);
  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <label className="field">
          <span className="field-label">{tr('Zone')}</span>
          <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')}>
            <option value="">{tr('Inconnue')}</option>
            {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{tr('Code produit (au dos de la boîte, sur le disque)')}</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SCES-00867" maxLength={30} autoComplete="off" spellCheck={false} />
        </label>
      </div>
      <fieldset className="field correction-languages">
        <legend className="field-label">{tr('Langues du jeu')}</legend>
        {LANGUAGES.map((l) => (
          <label key={l.value} className="check">
            <input type="checkbox" checked={languages.includes(l.value)} onChange={() => toggle(l.value)} /> {l.label}
          </label>
        ))}
      </fieldset>
      <SourcesField value={sources} onChange={setSources} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="button button-primary" disabled={busy}><PsSymbol shape="cross" />{tr(' Envoyer la correction')}</button>
      </div>
    </form>
  );
}
