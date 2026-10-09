import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { EDITION_TYPES, gamePath, LANGUAGES, yearOf, ZONES } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, prepareCover } from '../lib/images';
import type { DatePrecision, EditionType, Platform, Region, ReleaseProposal, Zone } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useGameSearch } from '../components/GameSearch';

// Proposer un jeu absent de la base, ou une version manquante d'un jeu existant
// (/proposer?jeu=12). La proposition est vérifiée par un modérateur avant publication.
export function ProposeGame() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [existingGame, setExistingGame] = useState<{ id: number; title: string } | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  const [title, setTitle] = useState('');
  const [platformId, setPlatformId] = useState<number | ''>('');
  const [zone, setZone] = useState<Zone | ''>('');
  const [localTitle, setLocalTitle] = useState('');
  const [localTitleTouched, setLocalTitleTouched] = useState(false);
  const [regionCode, setRegionCode] = useState('');
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [dateValue, setDateValue] = useState('');
  const [productCode, setProductCode] = useState('');
  const [editionType, setEditionType] = useState<EditionType>('standard');
  const [editionName, setEditionName] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [publisher, setPublisher] = useState('');
  const [developer, setDeveloper] = useState('');
  const [sources, setSources] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [noCover, setNoCover] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.from('platform').select('id, name, short_name').order('id').then(({ data }) => {
      const list = (data as Platform[]) ?? [];
      setPlatforms(list);
      if (list.length === 1) setPlatformId(list[0].id);
    });
    supabase.from('region').select('id, code, name, type, parent_id').order('name').then(({ data }) => setRegions((data as Region[]) ?? []));
  }, []);

  useEffect(() => {
    const id = Number.parseInt(params.get('jeu') ?? '', 10);
    if (!Number.isInteger(id)) return setExistingGame(null);
    supabase.from('game').select('id, title').eq('id', id).maybeSingle().then(({ data }) => setExistingGame(data));
  }, [params]);

  // Le titre sur la boîte reprend le titre du jeu tant qu'on ne l'a pas modifié
  useEffect(() => {
    if (!localTitleTouched) setLocalTitle(existingGame?.title ?? title);
  }, [title, existingGame, localTitleTouched]);

  // Aperçu de la jaquette choisie
  const preview = useMemo(() => (cover ? URL.createObjectURL(cover) : ''), [cover]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Ce jeu existe peut-être déjà ?
  const { results: similar } = useGameSearch(existingGame ? '' : title, 5);

  function releaseDate(): { date?: string; error?: string } {
    if (!dateValue) return {};
    if (precision === 'year') return /^\d{4}$/.test(dateValue) ? { date: `${dateValue}-01-01` } : { error: 'Année invalide.' };
    if (precision === 'month') return /^\d{4}-\d{2}$/.test(dateValue) ? { date: `${dateValue}-01` } : { error: 'Mois invalide.' };
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? { date: dateValue } : { error: 'Date invalide.' };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (!existingGame && !title.trim()) problems.push('Indique le titre du jeu.');
    if (!localTitle.trim()) problems.push('Indique le titre imprimé sur la boîte.');
    if (!platformId) problems.push('Choisis la console.');
    if (!zone) problems.push('Choisis la zone.');
    if (!cover && !noCover) problems.push('Ajoute la jaquette, ou coche « Il n\'existe pas de jaquette ».');
    const code = productCode.trim().toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) problems.push('Code produit invalide (exemple : SLES-00868).');
    const date = releaseDate();
    if (date.error) problems.push(date.error);
    if (date.date && !regionCode) problems.push('Indique le pays ou la zone de cette date de sortie.');
    setErrors(problems);
    if (problems.length) return;

    setBusy(true);
    let coverPath: string | undefined;
    try {
      if (cover) {
        const blob = await prepareCover(cover);
        coverPath = `${session!.user.id}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from('submission-images').upload(coverPath, blob, { contentType: 'image/webp', upsert: false });
        if (error) throw error;
      }

      const release: ReleaseProposal = {
        platform_id: platformId as number,
        zone: zone as Zone,
        local_title: localTitle.trim(),
        edition_type: editionType,
        languages,
        ...(code && { product_code: code }),
        ...(editionName.trim() && { edition_name: editionName.trim() }),
        ...(regionCode && { region_code: regionCode }),
        ...(date.date && { release_date: date.date, date_precision: precision }),
        ...(publisher.trim() && { publisher_name: publisher.trim() }),
        ...(developer.trim() && { developer_name: developer.trim() }),
      };
      const data = {
        ...(existingGame ? { game_id: existingGame.id } : { game: { title: title.trim() } }),
        release,
        ...(coverPath ? { cover_path: coverPath } : { no_cover: true }),
      };
      const { error } = await supabase.from('submission').insert({
        action: 'create',
        target: existingGame ? 'release' : 'game',
        data,
        sources: sources.trim() || null,
      });
      if (error) {
        // La proposition a échoué : on ne laisse pas l'image orpheline
        if (coverPath) await supabase.storage.from('submission-images').remove([coverPath]);
        throw error;
      }
      setDone(true);
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="panel narrow">
        <h1>Merci !</h1>
        <p>Ta proposition est enregistrée. Un modérateur va la vérifier avant de l'ajouter au catalogue.</p>
        <div className="actions">
          <Link to="/mes-propositions" className="button">Voir mes propositions</Link>
          <button type="button" className="button button-primary" onClick={() => window.location.reload()}>✕ Proposer autre chose</button>
        </div>
      </section>
    );
  }

  const zonesById = new Map(regions.filter((r) => r.type === 'zone').map((z) => [z.id, z]));

  return (
    <section className="stack">
      <h1>{existingGame ? 'Proposer une nouvelle version' : 'Proposer un jeu'}</h1>
      <form onSubmit={submit} className="form panel" noValidate>
        {existingGame ? (
          <p>
            Nouvelle version de <Link to={gamePath(existingGame)}><strong>{existingGame.title}</strong></Link>{' '}
            (<Link to="/proposer">c'est un autre jeu</Link>)
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Titre du jeu *</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </label>
            {similar.length > 0 && (
              <div className="notice">
                <p><strong>Ce jeu existe peut-être déjà :</strong></p>
                <ul className="plain-list">
                  {similar.map((g) => (
                    <li key={g.id} className="list-row">
                      <span>{g.title} <span className="muted">{yearOf(g.first_release_date)}</span></span>
                      <span className="actions">
                        <Link to={gamePath(g)} target="_blank" rel="noopener" className="button button-small">Voir</Link>
                        <Link to={`/proposer?jeu=${g.id}`} className="button button-small">C'est lui : ajouter une version</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="row">
          <label className="field">
            <span className="field-label">Console *</span>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value ? Number(e.target.value) : '')} required>
              <option value="">Choisir…</option>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.short_name})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Zone *</span>
            <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')} required>
              <option value="">Choisir…</option>
              {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">Titre imprimé sur la boîte *</span>
          <input value={localTitle} onChange={(e) => { setLocalTitle(e.target.value); setLocalTitleTouched(true); }} maxLength={200} required />
          <span className="hint">Par exemple « Biohazard » pour la version japonaise de Resident Evil.</span>
        </label>

        <div className="row">
          <label className="field">
            <span className="field-label">Code produit</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SLES-00868" maxLength={20} />
            <span className="hint">Sur la tranche du boîtier ou le disque.</span>
          </label>
          <label className="field">
            <span className="field-label">Édition</span>
            <select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {editionType !== 'standard' && (
            <label className="field">
              <span className="field-label">Nom de l'édition</span>
              <input value={editionName} onChange={(e) => setEditionName(e.target.value)} placeholder="Platinum" maxLength={60} />
            </label>
          )}
        </div>

        <fieldset className="row">
          <legend className="field-label">Date de sortie</legend>
          <label className="field">
            <span className="field-label">Pays ou zone</span>
            <select value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
              <option value="">Non précisé</option>
              {[...zonesById.values()].map((z) => (
                <optgroup key={z.id} label={z.name}>
                  <option value={z.code}>{z.name} (toute la zone)</option>
                  {regions.filter((r) => r.parent_id === z.id).map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Précision</span>
            <select value={precision} onChange={(e) => { setPrecision(e.target.value as DatePrecision); setDateValue(''); }}>
              <option value="day">Jour exact</option>
              <option value="month">Mois</option>
              <option value="year">Année seulement</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            {precision === 'year'
              ? <input type="number" min={1970} max={2100} value={dateValue} onChange={(e) => setDateValue(e.target.value)} placeholder="1997" />
              : <input type={precision === 'month' ? 'month' : 'date'} value={dateValue} onChange={(e) => setDateValue(e.target.value)} />}
          </label>
        </fieldset>

        <fieldset className="checks">
          <legend className="field-label">Langues</legend>
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="checkbox" checked={languages.includes(l.value)}
                onChange={(e) => setLanguages(e.target.checked ? [...languages, l.value] : languages.filter((x) => x !== l.value))} />
              {l.label}
            </label>
          ))}
        </fieldset>

        <div className="row">
          <label className="field">
            <span className="field-label">Éditeur</span>
            <input value={publisher} onChange={(e) => setPublisher(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span className="field-label">Développeur</span>
            <input value={developer} onChange={(e) => setDeveloper(e.target.value)} maxLength={120} />
          </label>
        </div>

        <fieldset className="cover-field">
          <legend className="field-label">Jaquette *</legend>
          <div className="cover-picker">
            <div className={`cover cover-medium${noCover ? ' cover-disabled' : ''}`}>
              {preview ? <img src={preview} alt="Aperçu de la jaquette" /> : <span className="cover-empty" aria-hidden="true">□</span>}
            </div>
            <div className="stack">
              <label className="field">
                <span className="field-label">Photo ou scan du recto (JPEG, PNG ou WebP)</span>
                <input type="file" accept={ACCEPT_ATTRIBUTE} disabled={noCover}
                  onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
              </label>
              <label className="switch">
                <input type="checkbox" checked={noCover} onChange={(e) => { setNoCover(e.target.checked); if (e.target.checked) setCover(null); }} />
                Il n'existe pas de jaquette pour ce jeu
              </label>
              <span className="hint">L'image est redimensionnée et ses informations cachées (position GPS…) sont supprimées avant l'envoi.</span>
            </div>
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">Sources</span>
          <textarea value={sources} onChange={(e) => setSources(e.target.value)} rows={2} maxLength={1000}
            placeholder="J'ai le jeu entre les mains, lien vers une page de référence…" />
        </label>

        {errors.length > 0 && (
          <ul className="error" role="alert">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
        )}
        <button type="submit" className="button button-primary" disabled={busy}>
          ✕ {busy ? 'Sauvegarde en cours… Ne retirez pas la carte mémoire' : 'Envoyer ma proposition'}
        </button>
      </form>
    </section>
  );
}
