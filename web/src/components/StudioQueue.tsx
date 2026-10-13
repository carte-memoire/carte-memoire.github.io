import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { countryName, formatNumber } from '../lib/format';
import type { CompanyResult } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from './Confirm';
import { studioCounts } from './GameSearch';
import { tr } from '../lib/i18n';

// Formes juridiques et mots génériques, ignorés pour comparer les noms
// (« Success » et « Success Corp. », « Silicon Dreams » et « Silicon Dreams Studios »)
const GENERIC = /\b(inc|ltd|co|corp|corporation|limited|gmbh|sa|llc|kk|plc|bv|srl|software|entertainment|studios?|games?|interactive|productions?|developments?)\b/g;

function nameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.,&']/g, ' ').replace(GENERIC, ' ').replace(/[^a-z0-9]/g, '');
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// Paires suspectes : même nom une fois les formes juridiques retirées, ou une ou deux
// lettres d'écart (fautes de frappe : « Phygnosis » pour « Psygnosis »)
function suspectPairs(studios: CompanyResult[], dismissed: Set<string>): [CompanyResult, CompanyResult][] {
  const keyed = studios.map((s) => ({ s, k: nameKey(s.name) })).filter((x) => x.k.length >= 4);
  const pairs: [CompanyResult, CompanyResult][] = [];
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i], b = keyed[j];
      if (dismissed.has(pairKey(a.s.id, b.s.id))) continue;
      const same = a.k === b.k;
      const close = !same && a.k.length >= 5 && b.k.length >= 5 && Math.abs(a.k.length - b.k.length) <= 2
        && distance(a.k, b.k) <= (Math.min(a.k.length, b.k.length) > 8 ? 2 : 1);
      if (same || close) pairs.push(a.s.developed + a.s.published >= b.s.developed + b.s.published ? [a.s, b.s] : [b.s, a.s]);
    }
  }
  return pairs;
}

export function StudioQueue({ onCount }: { onCount: (n: number) => void }) {
  const { aal } = useAuth();
  const confirm = useConfirm();
  const [studios, setStudios] = useState<CompanyResult[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canAct = aal.current === 'aal2';

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc('search_companies', { search: null, platform_code: null, max_results: 2000 }),
      supabase.from('dismissed_company_duplicate').select('company_a, company_b'),
    ]).then(([list, gone]) => {
      if (!active) return;
      setError(list.error ? errorMessage(list.error) : '');
      setStudios((list.data as CompanyResult[] | null) ?? []);
      setDismissed(new Set(((gone.data ?? []) as { company_a: number; company_b: number }[]).map((d) => pairKey(d.company_a, d.company_b))));
    });
    return () => { active = false; };
  }, [version]);

  const pairs = useMemo(() => (studios ? suspectPairs(studios, dismissed) : []), [studios, dismissed]);
  useEffect(() => { onCount(pairs.length); }, [pairs.length, onCount]);

  async function merge(keep: CompanyResult, duplicate: CompanyResult) {
    if (!(await confirm({
      title: tr('Fusionner deux studios'),
      message: tr("Les jeux de « {0} » passent à « {1} », puis « {2} » disparaît. Son nom restera reconnu dans les propositions. La fusion ne s'annule pas.", duplicate.name, keep.name, duplicate.name),
      confirmLabel: tr('Garder « {0} »', keep.name),
    }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('merge_companies', { keep_id: keep.id, duplicate_id: duplicate.id });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setVersion((v) => v + 1);
  }

  async function dismiss(a: CompanyResult, b: CompanyResult) {
    setBusy(true);
    const { error } = await supabase.from('dismissed_company_duplicate').insert({ company_a: Math.min(a.id, b.id), company_b: Math.max(a.id, b.id) });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setDismissed((d) => new Set(d).add(pairKey(a.id, b.id)));
  }

  return (
    <div className="stack">
      <p className="hint">
        {tr("Noms presque identiques repérés automatiquement : même nom une fois « Inc. », « Ltd. », « Studios »… retirés, ou une à deux lettres d'écart. Garde le bon nom, ou écarte la paire si ce sont deux sociétés différentes.")}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <RenameStudio canAct={canAct} onRenamed={() => setVersion((v) => v + 1)} />
      {studios === null && <p className="loading">{tr('Lecture des studios…')}</p>}
      {studios !== null && pairs.length === 0 && <p className="panel empty">{tr('Aucun doublon de studio en vue. Bravo !')}</p>}
      <ul className="plain-list queue-list">
        {pairs.map(([a, b]) => (
          <li key={pairKey(a.id, b.id)} className="panel studio-pair">
            {a.wikidata_id && b.wikidata_id && a.wikidata_id !== b.wikidata_id && (
              <p className="warning small">{tr('Deux fiches Wikidata différentes : ce sont souvent deux sociétés distinctes. Vérifie avant de fusionner.')}</p>
            )}
            <div className="studio-pair-cards">
              {[a, b].map((s, i) => (
                <div key={s.id} className="duplicate-card studio-card">
                  <div>
                    <p><strong>{s.name}</strong></p>
                    <p className="small muted">
                      {[s.country && countryName(s.country), studioCounts(s) || tr('aucun jeu')].filter(Boolean).join(' · ')}
                      {s.wikidata_id && <> · <a href={`https://www.wikidata.org/wiki/${s.wikidata_id}`} target="_blank" rel="noopener noreferrer">{s.wikidata_id}</a></>}
                    </p>
                    <p className="small"><Link to={`/catalogue?studio=${s.id}&zone=toutes`} target="_blank">{tr('Voir ses jeux')}</Link></p>
                  </div>
                  <button type="button" className="button button-small" disabled={!canAct || busy} onClick={() => merge(s, i === 0 ? b : a)}>{tr('Garder ce nom')}</button>
                </div>
              ))}
            </div>
            <button type="button" className="link-button small" disabled={!canAct || busy} onClick={() => dismiss(a, b)}>{tr('Ce ne sont pas des doublons')}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Corriger le nom d'un studio (faute de frappe sans doublon pour la corriger)
function RenameStudio({ canAct, onRenamed }: { canAct: boolean; onRenamed: () => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CompanyResult[]>([]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setFound([]);
    let active = true;
    const timer = setTimeout(() => {
      supabase.rpc('search_companies', { search: q, platform_code: null, max_results: 8 })
        .then(({ data }) => { if (active) setFound((data as CompanyResult[] | null) ?? []); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (name.length < 1 || name.length > 200) return setError(tr('Le nom doit faire entre 1 et 200 caractères.'));
    const { error } = await supabase.from('company').update({ name, updated_at: new Date().toISOString() }).eq('id', editing.id);
    if (error) return setError(errorMessage(error));
    setError('');
    setEditing(null);
    setQuery(name);
    onRenamed();
  }

  return (
    <details className="panel rename-studio">
      <summary>{tr("Corriger le nom d'un studio")}</summary>
      <label className="field">
        <span className="field-label">{tr('Studio à corriger')}</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Phygnosis, Adrenlin…')} maxLength={120} autoComplete="off" />
      </label>
      {error && <p className="error small">{error}</p>}
      <ul className="plain-list">
        {found.map((s) => (
          <li key={s.id} className="list-row">
            {editing?.id === s.id ? (
              <form className="inline-form form" onSubmit={save}>
                <input value={editing.name} onChange={(e) => setEditing({ id: s.id, name: e.target.value })} maxLength={200} aria-label={tr('Nouveau nom')} />
                <button type="submit" className="button button-small button-primary" disabled={!canAct}>{tr('Enregistrer')}</button>
                <button type="button" className="link-button small" onClick={() => setEditing(null)}>{tr('Annuler')}</button>
              </form>
            ) : (
              <>
                <span>{s.name} <span className="muted small">· {formatNumber(s.developed + s.published)}{tr(' jeu{0?x}', s.developed + s.published > 1)}</span></span>
                <button type="button" className="link-button small" disabled={!canAct} onClick={() => setEditing({ id: s.id, name: s.name })}>{tr('Renommer')}</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
