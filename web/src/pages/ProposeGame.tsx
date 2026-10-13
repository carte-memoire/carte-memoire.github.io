import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  EDITION_TYPES, gamePath, LANGUAGES, yearOf, ZONES, BOX_REGIONS, boxRegionName, regionName,
} from '../lib/format';
import { errorMessage } from '../lib/errors';
import { ACCEPT_ATTRIBUTE, prepareCover } from '../lib/images';
import type { DatePrecision, EditionType, Region, ReleaseProposal, Zone } from '../lib/types';
import { groupByManufacturer, usePlatforms } from '../lib/usePlatforms';
import { useAuth } from '../auth/AuthContext';
import { useGameSearch } from '../components/GameSearch';
import { PsSymbol } from '../components/PsSymbol';
import { EMPTY_STUDIO, StudioField, type StudioValue } from '../components/StudioField';
import { tr } from '../lib/i18n';

// Proposer un jeu absent de la base, ou une version manquante d'un jeu existant
// (/proposer?jeu=12). La proposition est vérifiée par un modérateur avant publication.
export function ProposeGame() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [existingGame, setExistingGame] = useState<{ id: number; title: string } | null>(null);
  const platforms = usePlatforms();
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
  const [publisher, setPublisher] = useState<StudioValue>(EMPTY_STUDIO);
  const [developer, setDeveloper] = useState<StudioValue>(EMPTY_STUDIO);
  const [boxRegion, setBoxRegion] = useState('');
  const [sources, setSources] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [noCover, setNoCover] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.from('region').select('id, code, name, type, parent_id').order('name').then(({ data }) => setRegions((data as Region[]) ?? []));
  }, []);

  // PlayStation présélectionnée (la seule console qui a des jeux pour l'instant)
  useEffect(() => {
    if (platformId === '' && platforms.length) setPlatformId(platforms.find((p) => p.short_name === 'PS1')?.id ?? '');
  }, [platforms, platformId]);

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
    if (precision === 'year') return /^\d{4}$/.test(dateValue) ? { date: `${dateValue}-01-01` } : { error: tr('Année invalide.') };
    if (precision === 'month') return /^\d{4}-\d{2}$/.test(dateValue) ? { date: `${dateValue}-01` } : { error: tr('Mois invalide.') };
    return /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? { date: dateValue } : { error: tr('Date invalide.') };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (!existingGame && !title.trim()) problems.push(tr('Indique le titre du jeu.'));
    if (!localTitle.trim()) problems.push(tr('Indique le titre imprimé sur la boîte.'));
    if (!platformId) problems.push(tr('Choisis la console.'));
    if (!zone) problems.push(tr('Choisis la zone.'));
    if (!cover && !noCover) problems.push(tr("Ajoute la jaquette, ou coche « Il n'existe pas de jaquette »."));
    const code = productCode.trim().toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9 ._-]{2,19}$/.test(code)) problems.push(tr('Code produit invalide (exemple : SCES-00867).'));
    const date = releaseDate();
    if (date.error) problems.push(date.error);
    if (date.date && !regionCode) problems.push(tr('Indique le pays ou la zone de cette date de sortie.'));
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
        // Studio de la liste : son identifiant ; sinon le nom tapé (nouveau studio, vérifié en modération)
        ...(publisher.id ? { publisher_id: publisher.id } : publisher.name.trim() ? { publisher_name: publisher.name.trim() } : {}),
        ...(developer.id ? { developer_id: developer.id } : developer.name.trim() ? { developer_name: developer.name.trim() } : {}),
        ...(boxRegion && { box_region_code: boxRegion }),
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
        <h1>{tr('Merci !')}</h1>
        <p>{tr("Ta proposition est enregistrée. Un modérateur va la vérifier avant de l'ajouter au catalogue.")}</p>
        <div className="actions">
          <Link to="/mes-propositions" className="button">{tr('Voir mes propositions')}</Link>
          <button type="button" className="button button-primary" onClick={() => window.location.reload()}><PsSymbol shape="cross" />{tr(' Proposer autre chose')}</button>
        </div>
      </section>
    );
  }

  const zonesById = new Map(regions.filter((r) => r.type === 'zone').map((z) => [z.id, z]));

  return (
    <section className="stack">
      <h1>{existingGame ? tr('Proposer une nouvelle version') : tr('Proposer un jeu')}</h1>
      <form onSubmit={submit} className="form panel" noValidate>
        {existingGame ? (
          <p>
            {tr('Nouvelle version de ')}<Link to={gamePath(existingGame)}><strong>{existingGame.title}</strong></Link>{' '}
            (<Link to="/proposer">{tr("c'est un autre jeu")}</Link>)
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">{tr('Titre du jeu *')}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </label>
            {similar.length > 0 && (
              <div className="notice">
                <p><strong>{tr('Ce jeu existe peut-être déjà :')}</strong></p>
                <ul className="plain-list">
                  {similar.map((g) => (
                    <li key={g.id} className="list-row">
                      <span>{g.title} <span className="muted">{yearOf(g.first_release_date)}</span></span>
                      <span className="actions">
                        <Link to={gamePath(g)} target="_blank" rel="noopener" className="button button-small">{tr('Voir')}</Link>
                        <Link to={`/proposer?jeu=${g.id}`} className="button button-small">{tr("C'est lui : ajouter une version")}</Link>
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
            <span className="field-label">{tr('Console *')}</span>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value ? Number(e.target.value) : '')} required>
              <option value="">{tr('Choisir…')}</option>
              {groupByManufacturer(platforms).map(([maker, list]) => (
                <optgroup key={maker} label={maker}>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr('Zone *')}</span>
            <select value={zone} onChange={(e) => setZone(e.target.value as Zone | '')} required>
              <option value="">{tr('Choisir…')}</option>
              {ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">{tr('Titre imprimé sur la boîte *')}</span>
          <input value={localTitle} onChange={(e) => { setLocalTitle(e.target.value); setLocalTitleTouched(true); }} maxLength={200} required />
          <span className="hint">{tr('Par exemple « Biohazard » pour la version japonaise de Resident Evil.')}</span>
        </label>

        <div className="row">
          <label className="field">
            <span className="field-label">{tr('Code produit')}</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="SCES-00867" maxLength={20} />
            <span className="hint">{tr('Sur la tranche du boîtier ou le disque.')}</span>
          </label>
          <label className="field">
            <span className="field-label">{tr('Édition')}</span>
            <select value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {editionType !== 'standard' && (
            <label className="field">
              <span className="field-label">{tr("Nom de l'édition")}</span>
              <input value={editionName} onChange={(e) => setEditionName(e.target.value)} placeholder={tr('Platinum')} maxLength={60} />
            </label>
          )}
        </div>

        <fieldset className="row">
          <legend className="field-label">{tr('Date de sortie')}</legend>
          <label className="field">
            <span className="field-label">{tr('Pays ou zone')}</span>
            <select value={regionCode} onChange={(e) => setRegionCode(e.target.value)}>
              <option value="">{tr('Non précisé')}</option>
              {[...zonesById.values()].map((z) => (
                <optgroup key={z.id} label={regionName(z)}>
                  <option value={z.code}>{regionName(z)}{tr(' (toute la zone)')}</option>
                  {regions.filter((r) => r.parent_id === z.id).map((r) => <option key={r.id} value={r.code}>{regionName(r)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr('Précision')}</span>
            <select value={precision} onChange={(e) => { setPrecision(e.target.value as DatePrecision); setDateValue(''); }}>
              <option value="day">{tr('Jour exact')}</option>
              <option value="month">{tr('Mois')}</option>
              <option value="year">{tr('Année seulement')}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{tr('Date')}</span>
            {precision === 'year'
              ? <input type="number" min={1970} max={2100} value={dateValue} onChange={(e) => setDateValue(e.target.value)} placeholder="1997" />
              : <input type={precision === 'month' ? 'month' : 'date'} value={dateValue} onChange={(e) => setDateValue(e.target.value)} />}
          </label>
        </fieldset>

        <fieldset className="checks">
          <legend className="field-label">{tr('Langues')}</legend>
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="checkbox" checked={languages.includes(l.value)}
                onChange={(e) => setLanguages(e.target.checked ? [...languages, l.value] : languages.filter((x) => x !== l.value))} />
              {l.label}
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field-label">{tr('Boîte vendue en (facultatif)')}</span>
          <select value={boxRegion} onChange={(e) => setBoxRegion(e.target.value)}>
            <option value="">{tr('Non précisé')}</option>
            {BOX_REGIONS.map((code) => <option key={code} value={code}>{boxRegionName(code)}</option>)}
          </select>
          <span className="hint">{tr('Si le dos de ta boîte est écrit pour un seul pays (tout en français, par exemple) alors que le disque contient plusieurs langues.')}</span>
        </label>

        <div className="row">
          <StudioField label={tr('Éditeur')} value={publisher} onChange={setPublisher} />
          <StudioField label={tr('Développeur')} value={developer} onChange={setDeveloper} />
        </div>

        <fieldset className="cover-field">
          <legend className="field-label">{tr('Jaquette *')}</legend>
          <div className="cover-picker">
            <div className={`cover cover-medium${noCover ? ' cover-disabled' : ''}`}>
              {preview ? <img src={preview} alt={tr('Aperçu de la jaquette')} /> : <span className="cover-empty" aria-hidden="true"><PsSymbol shape="square" /></span>}
            </div>
            <div className="stack">
              <label className="field">
                <span className="field-label">{tr('Photo ou scan du recto (JPEG, PNG ou WebP)')}</span>
                <input type="file" accept={ACCEPT_ATTRIBUTE} disabled={noCover}
                  onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
              </label>
              <label className="switch">
                <input type="checkbox" checked={noCover} onChange={(e) => { setNoCover(e.target.checked); if (e.target.checked) setCover(null); }} />
                {tr("Il n'existe pas de jaquette pour ce jeu")}
              </label>
              <span className="hint">{tr("L'image est redimensionnée et ses informations cachées (position GPS…) sont supprimées avant l'envoi.")}</span>
            </div>
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">{tr('Sources')}</span>
          <textarea value={sources} onChange={(e) => setSources(e.target.value)} rows={2} maxLength={1000}
            placeholder={tr("J'ai le jeu entre les mains, lien vers une page de référence…")} />
        </label>

        {errors.length > 0 && (
          <ul className="error" role="alert">{errors.map((m) => <li key={m}>{m}</li>)}</ul>
        )}
        <button type="submit" className="button button-primary" disabled={busy}>
          <PsSymbol shape="cross" /> {busy ? tr('Sauvegarde en cours… Ne retirez pas la carte mémoire') : tr('Envoyer ma proposition')}
        </button>
      </form>
    </section>
  );
}
