import { useState } from 'react';
import { findCompany, useCompanies, type CompanyOption } from '../lib/useCompanies';
import { StudioField, EMPTY_STUDIO, type StudioValue } from './StudioField';

// Décision du modérateur pour un studio proposé : créé, remplacé par un studio
// existant (faute de frappe), ou retiré. null = rien à décider (studio connu).
export type StudioChoice = 'create' | 'skip' | number | null;

// Un studio d'une proposition (éditeur ou développeur), et ce qu'il faut en décider
export function StudioDecision({ label, id, name, choice, onChoice }: {
  label: string;
  id?: number;
  name?: string;
  choice: StudioChoice | undefined;
  onChoice: (choice: StudioChoice | undefined) => void;
}) {
  const companies = useCompanies();
  const [other, setOther] = useState<StudioValue>(EMPTY_STUDIO);
  const [mode, setMode] = useState<'create' | 'existing' | 'skip' | null>(null);

  function pick(next: 'create' | 'existing' | 'skip') {
    setMode(next);
    onChoice(next === 'existing' ? (other.id ?? undefined) : next);
  }
  const chosen = id ? companies.find((c) => c.id === id) : undefined;
  const same = !id && name ? findCompany(companies, name) : undefined;

  if (!id && !name) return null;
  if (chosen || same) {
    return (
      <p className="studio-decision">
        <strong>{label} :</strong> {(chosen ?? same)!.name} <span className="hint studio-known">✓ {chosen ? 'choisi dans la liste' : 'existe déjà'}</span>
      </p>
    );
  }
  if (id) return <p className="studio-decision"><strong>{label} :</strong> studio n° {id} (lecture de la liste…)</p>;

  const search = encodeURIComponent(name!);
  return (
    <fieldset className="warning studio-decision">
      <legend className="field-label">{label} : nouveau studio « {name} »</legend>
      <p className="small">
        Vérifie qu'il existe bien et que son nom est bien écrit :{' '}
        <a href={`https://fr.wikipedia.org/w/index.php?search=${search}`} target="_blank" rel="noopener noreferrer">Wikipédia</a>,{' '}
        <a href={`https://en.wikipedia.org/w/index.php?search=${search}`} target="_blank" rel="noopener noreferrer">Wikipedia (anglais)</a>.
      </p>
      <label className="radio-row">
        <input type="radio" checked={mode === 'create'} onChange={() => pick('create')} />
        Il existe : créer le studio « {name} »
      </label>
      <label className="radio-row">
        <input type="radio" checked={mode === 'existing'} onChange={() => pick('existing')} />
        C'est un studio déjà connu (faute de frappe, autre nom)
      </label>
      {mode === 'existing' && (
        <>
          <StudioField label="Studio existant" value={other} onChange={(v) => { setOther(v); onChoice(v.id ?? undefined); }} autoFocus />
          {choice === undefined && <span className="hint">Choisis le studio dans la liste.</span>}
        </>
      )}
      <label className="radio-row">
        <input type="radio" checked={mode === 'skip'} onChange={() => pick('skip')} />
        Ne pas renseigner ce studio
      </label>
    </fieldset>
  );
}

// Reste-t-il un studio inconnu sans décision ?
export function needsStudioDecision(companies: CompanyOption[], id: number | undefined, name: string | undefined, choice: StudioChoice | undefined) {
  if (id || !name?.trim()) return false;
  if (findCompany(companies, name)) return false;
  return choice === undefined || choice === null;
}
