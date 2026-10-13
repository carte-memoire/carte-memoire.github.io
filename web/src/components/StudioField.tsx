import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { countryName, searchKey } from '../lib/format';
import { findCompany, useCompanies, type CompanyOption } from '../lib/useCompanies';
import { tr } from '../lib/i18n';

// Un studio choisi : dans la liste (id), ou un nom tapé qui n'y est pas (id vide,
// « nouveau studio », vérifié par un modérateur avant d'entrer dans la base)
export interface StudioValue {
  id: number | null;
  name: string;
}

export const EMPTY_STUDIO: StudioValue = { id: null, name: '' };

const MAX_SHOWN = 12;

// Champ « Éditeur » ou « Développeur » : on tape, la liste des studios existants se
// filtre (accents et majuscules ignorés) ; flèches, Entrée et Échap au clavier
export function StudioField({ label, value, onChange, hint, autoFocus }: {
  label: string;
  value: StudioValue;
  onChange: (value: StudioValue) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  const companies = useCompanies();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const key = searchKey(value.name);
  const matches: CompanyOption[] = key
    ? companies
      .filter((c) => searchKey(c.name).includes(key))
      .sort((a, b) => Number(searchKey(b.name).startsWith(key)) - Number(searchKey(a.name).startsWith(key)) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, MAX_SHOWN)
    : [];
  const isNew = Boolean(value.name.trim()) && value.id === null && companies.length > 0;

  function type(name: string) {
    // Nom identique à un studio existant : c'est lui
    const same = findCompany(companies, name);
    onChange({ id: same?.id ?? null, name });
    setOpen(true);
    setActive(0);
  }

  function choose(c: CompanyOption | undefined) {
    if (!c) return;
    onChange({ id: c.id, name: c.name });
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="field combobox">
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        value={value.name}
        onChange={(e) => type(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={200}
        placeholder={tr('Tape pour chercher dans la liste')}
        autoFocus={autoFocus}
      />
      {open && matches.length > 0 && (
        <ul id={listId} ref={listRef} className="combobox-list" role="listbox">
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} className={i === active ? 'combobox-option active' : 'combobox-option'}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }} onMouseEnter={() => setActive(i)}>
              <span>{c.name}</span>
              {c.country && <span className="combobox-detail">{countryName(c.country)}</span>}
            </li>
          ))}
        </ul>
      )}
      {value.id !== null && <span className="hint studio-known">{tr('✓ Studio de la liste')}</span>}
      {isNew && (
        <span className="hint studio-new">
          {tr("Nouveau studio : il ne sera ajouté qu'après vérification par un modérateur. Vérifie l'orthographe (et la liste) avant.")}
        </span>
      )}
      {hint && !isNew && value.id === null && <span className="hint">{hint}</span>}
    </div>
  );
}
