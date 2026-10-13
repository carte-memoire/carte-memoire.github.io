import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchKey } from '../lib/format';
import { tr } from '../lib/i18n';

export interface ComboboxOption<T> {
  value: T;
  label: string;
  detail?: string; // texte secondaire, cherché lui aussi (« RPG + Stratégie »)
}

const MAX_SHOWN = 60;

// Champ à autocomplétion (« combobox ») : on tape, la liste se filtre ; flèches,
// Entrée et Échap au clavier. Les accents et majuscules ne comptent pas.
export function Combobox<T>({ label, options, onSelect, placeholder, emptyText = tr('Aucun résultat') }: {
  label: string;
  options: ComboboxOption<T>[];
  onSelect: (option: ComboboxOption<T>) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const key = searchKey(query);
  const matches = (key
    ? options
      .filter((o) => searchKey(o.label).includes(key) || (o.detail !== undefined && searchKey(o.detail).includes(key)))
      // Ceux qui commencent par le texte tapé d'abord
      .sort((a, b) => Number(searchKey(b.label).startsWith(key)) - Number(searchKey(a.label).startsWith(key)))
    : options
  ).slice(0, MAX_SHOWN);

  // L'option active reste visible quand on la déplace au clavier. On fait défiler
  // la liste seule (pas la page : sinon la liste glisse sous la souris, qui choisit à sa place)
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [active, open]);

  function choose(option: ComboboxOption<T> | undefined) {
    if (!option) return;
    onSelect(option);
    setQuery('');
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // dans une fenêtre, Échap ferme la liste, pas la fenêtre
      setOpen(false);
    }
  }

  return (
    <div className="combobox">
      <label className="field">
        <span className="field-label">{label}</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && (
        <ul id={listId} ref={listRef} role="listbox" className="combobox-list">
          {matches.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'combobox-option active' : 'combobox-option'}
              // mousedown plutôt que click : le champ ne perd pas le focus avant le choix
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              // mousemove : seule une vraie mise en mouvement de la souris change l'option active
              onMouseMove={() => { if (i !== active) setActive(i); }}
            >
              <span>{o.label}</span>
              {o.detail && <span className="combobox-detail">{o.detail}</span>}
            </li>
          ))}
          {matches.length === 0 && <li className="combobox-empty">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
}
