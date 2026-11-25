// L'aspect d'une étagère de Ma collection, au goût du collectionneur (lib/useShelfStyles.ts) :
// le meuble (tablettes murales, bibliothèque, vitrine), la finition (bois rendus avec Blender,
// laques, métal brossé, verre), l'épaisseur du bois et l'éclairage. Chaque étagère se règle à
// part (« Personnaliser » sur le meuble), ou toutes d'un coup.
import type { ReactNode } from 'react';
import { tr } from '../lib/i18n';
import type { ShelfFinish, ShelfFurniture as Furniture, ShelfLight, ShelfStyle, ShelfThickness } from '../lib/preferences';
import { ALL_CONSOLES, AUTO, LEVEL_CHOICES, MAX_FURNITURE, PER_LEVEL_CHOICES, type Meuble } from '../lib/room';

const icon = (path: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{path}</svg>;

export const SHELF_FURNITURES: { value: Furniture; readonly label: string; readonly hint: string; icon: ReactNode }[] = [
  {
    value: 'tablettes', get label() { return tr('Tablettes murales'); }, get hint() { return tr('Des planches fixées au mur, sans meuble autour'); },
    icon: icon(<path d="M4 4h2v7H4zM7 5h2v6H7zM10 3.5h2V11h-2zM2 11h20v2H2zM5 15h2v5H5zM8 14h2v6H8zM2 20h20v2H2z" />),
  },
  {
    value: 'bibliotheque', get label() { return tr('Bibliothèque'); }, get hint() { return tr('Un meuble en bois : montants, fond, plaque au nom de la console'); },
    icon: icon(<path fillRule="evenodd" d="M2 1h20v22H2zm3 4v6h14V5zm0 8v7h14v-7zM6 6h2v5H6zm3 1h2v4H9zm-3 7h2v6H6zm3 1h2v5H9z" />),
  },
  {
    value: 'vitrine', get label() { return tr('Vitrine'); }, get hint() { return tr('Un meuble fermé par une porte vitrée, étagères en verre, éclairé'); },
    icon: icon(<path fillRule="evenodd" d="M3 1h18v22H3zm2 2v18h14V3zm1.5 5.5h11v1h-11zm0 6h11v1h-11zM16 10h1.5v4H16zM7 4.5l4 0-4 4z" />),
  },
];

export const SHELF_FINISHES: { value: ShelfFinish; readonly label: string }[] = [
  { value: 'noyer', get label() { return tr('Noyer'); } },
  { value: 'chene', get label() { return tr('Chêne'); } },
  { value: 'erable', get label() { return tr('Érable'); } },
  { value: 'ebene', get label() { return tr('Ébène'); } },
  { value: 'noir', get label() { return tr('Noir laqué'); } },
  { value: 'blanc', get label() { return tr('Blanc laqué'); } },
  { value: 'rouge', get label() { return tr('Rouge laqué'); } },
  { value: 'bleu', get label() { return tr('Bleu laqué'); } },
  { value: 'vert', get label() { return tr('Vert anglais'); } },
  { value: 'metal', get label() { return tr('Métal brossé'); } },
  { value: 'verre', get label() { return tr('Verre fumé'); } },
];

export const SHELF_THICKNESSES: { value: ShelfThickness; readonly label: string }[] = [
  { value: 'fine', get label() { return tr('Fine'); } },
  { value: 'normale', get label() { return tr('Normale'); } },
  { value: 'epaisse', get label() { return tr('Épaisse'); } },
  { value: 'massive', get label() { return tr('Massive'); } },
];

export const SHELF_LIGHTS: { value: ShelfLight; readonly label: string }[] = [
  { value: 'eteint', get label() { return tr('Éteint'); } },
  { value: 'chaud', get label() { return tr('Blanc chaud'); } },
  { value: 'froid', get label() { return tr('Blanc froid'); } },
  { value: 'rgb', get label() { return tr('RGB'); } },
];

// Classes du meuble (styles.css : « Le meuble de la collection »)
export const shelfClass = (style: ShelfStyle) =>
  `furniture-${style.furniture} board-${style.finish} board-${style.thickness} light-${style.light}`;

// Le choix, en quatre groupes ; chaque finition montre un petit bout de meuble
export function ShelfStylePicker({ value, onChange, name }: { value: ShelfStyle; onChange: (style: ShelfStyle) => void; name: string }) {
  const set = (changes: Partial<ShelfStyle>) => onChange({ ...value, ...changes });
  return (
    <div className="shelf-style">
      <fieldset className="pill-choice">
        <legend className="field-label">{tr('Meuble')}</legend>
        <div className="pills">
          {SHELF_FURNITURES.map((f) => (
            <label key={f.value} className={value.furniture === f.value ? 'pill view-option active' : 'pill view-option'} title={f.hint}>
              <input type="radio" name={`${name}-meuble`} className="sr-only" checked={value.furniture === f.value} onChange={() => set({ furniture: f.value })} />
              {f.icon}{f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="pill-choice">
        <legend className="field-label">{tr('Finition')}</legend>
        <div className="board-choices">
          {SHELF_FINISHES.map((f) => (
            <label key={f.value} className={value.finish === f.value ? 'board-choice active' : 'board-choice'}>
              <input type="radio" name={`${name}-finition`} className="sr-only" checked={value.finish === f.value} onChange={() => set({ finish: f.value })} />
              <span className={`board-sample board-${f.value}`} aria-hidden="true" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="shelf-style-row">
        <fieldset className="pill-choice">
          <legend className="field-label">{tr('Épaisseur du bois')}</legend>
          <div className="pills">
            {SHELF_THICKNESSES.map((t) => (
              <label key={t.value} className={value.thickness === t.value ? 'pill active' : 'pill'}>
                <input type="radio" name={`${name}-epaisseur`} className="sr-only" checked={value.thickness === t.value} onChange={() => set({ thickness: t.value })} />
                <span className={`board-edge board-${t.value}`} aria-hidden="true" />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="pill-choice">
          <legend className="field-label">{tr('Éclairage')}</legend>
          <div className="pills">
            {SHELF_LIGHTS.map((l) => (
              <label key={l.value} className={value.light === l.value ? 'pill active' : 'pill'}>
                <input type="radio" name={`${name}-eclairage`} className="sr-only" checked={value.light === l.value} onChange={() => set({ light: l.value })} />
                <span className={`light-dot light-${l.value}`} aria-hidden="true" />
                {l.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

// Le réglage d'un meuble, posé juste au-dessus de lui : ses changements se voient aussitôt.
// Le nom sur sa plaque, ce qu'il reçoit, ses étages, puis son aspect ; enfin le déplacer, le
// dupliquer, le retirer (ses jeux passent au meuble suivant de leur console, ou au carton).
export function MeubleEditor({ meuble, consoles, index, count, onChange, onMove, onDuplicate, onRemove, onApplyLook, onClose }: {
  meuble: Meuble;
  consoles: { code: string; name: string }[];
  index: number;
  count: number;
  onChange: (changes: Partial<Meuble>) => void;
  onMove: (step: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onApplyLook: () => void;
  onClose: () => void;
}) {
  const name = `meuble-${meuble.id}`;
  const choice = (value: number) => (value === AUTO ? tr('Auto') : String(value));
  return (
    <div className="panel shelf-style-panel" role="group" aria-label={tr('Réglage du meuble « {0} »', meuble.name)}>
      <div className="shelf-style-head">
        <h3>{tr('Ce meuble')}</h3>
        <div className="actions">
          <button type="button" className="button button-small" disabled={index === 0} onClick={() => onMove(-1)} title={tr('Le placer avant le meuble précédent')}>{tr('← Avancer')}</button>
          <button type="button" className="button button-small" disabled={index >= count - 1} onClick={() => onMove(1)} title={tr('Le placer après le meuble suivant')}>{tr('Reculer →')}</button>
          <button type="button" className="button button-small button-primary" onClick={onClose}>{tr('Terminé')}</button>
        </div>
      </div>
      <div className="shelf-style-row">
        <label className="field">
          <span className="field-label">{tr('Nom sur la plaque')}</span>
          <input type="text" value={meuble.name} maxLength={40} placeholder={tr('Mes RPG, PlayStation…')} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">{tr('Ce qu’il reçoit')}</span>
          <select value={meuble.content} onChange={(e) => onChange({ content: e.target.value })}>
            {consoles.map((c) => <option key={c.code} value={c.code}>{tr('Les jeux {0}', c.name)}</option>)}
            <option value={ALL_CONSOLES}>{tr('Toutes les consoles')}</option>
          </select>
        </label>
      </div>
      <div className="shelf-style-row">
        <fieldset className="pill-choice">
          <legend className="field-label">{tr('Étages')}</legend>
          <div className="pills">
            {LEVEL_CHOICES.map((n) => (
              <label key={n} className={meuble.levels === n ? 'pill active' : 'pill'} title={n === AUTO ? tr('Autant d’étages que de jeux à ranger') : undefined}>
                <input type="radio" name={`${name}-etages`} className="sr-only" checked={meuble.levels === n} onChange={() => onChange({ levels: n })} />
                {choice(n)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="pill-choice">
          <legend className="field-label">{tr('Jeux par étage')}</legend>
          <div className="pills">
            {PER_LEVEL_CHOICES.map((n) => (
              <label key={n} className={meuble.perLevel === n ? 'pill active' : 'pill'} title={n === AUTO ? tr('Toute la largeur de l’écran') : undefined}>
                <input type="radio" name={`${name}-largeur`} className="sr-only" checked={meuble.perLevel === n} onChange={() => onChange({ perLevel: n })} />
                {choice(n)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <ShelfStylePicker name={name} value={meuble.style} onChange={(style) => onChange({ style })} />
      <div className="actions shelf-style-foot">
        <button type="button" className="button button-small" onClick={onApplyLook}>{tr('Même aspect pour tous les meubles')}</button>
        <button type="button" className="button button-small" disabled={count >= MAX_FURNITURE} onClick={onDuplicate}>{tr('Dupliquer')}</button>
        <button type="button" className="button button-small button-danger" onClick={onRemove}>{tr('Retirer ce meuble')}</button>
      </div>
    </div>
  );
}

// Le réglage de l'exposition (les jaquettes de face) : son aspect seulement
export function ShelfStylePanel({ title, value, onChange, onApplyAll, onClose, name }: {
  title: string; value: ShelfStyle; onChange: (style: ShelfStyle) => void; onApplyAll: () => void; onClose: () => void; name: string;
}) {
  return (
    <div className="panel shelf-style-panel" role="group" aria-label={title}>
      <div className="shelf-style-head">
        <h3>{title}</h3>
        <div className="actions">
          <button type="button" className="button button-small" onClick={onApplyAll} title={tr('Le même aspect pour tous tes meubles')}>
            {tr('Même aspect pour tous les meubles')}
          </button>
          <button type="button" className="button button-small button-primary" onClick={onClose}>{tr('Terminé')}</button>
        </div>
      </div>
      <ShelfStylePicker name={name} value={value} onChange={onChange} />
    </div>
  );
}

// Le bouton « Personnaliser » posé sur chaque meuble
export function ShelfStyleButton({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" className={open ? 'furniture-tune is-open' : 'furniture-tune'} aria-expanded={open} title={label} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M20.7 3.3a1 1 0 0 0-1.4 0l-8.6 8.6 1.4 1.4 8.6-8.6a1 1 0 0 0 0-1.4zM9.3 13.3c-1.7 0-3 1.3-3 3 0 1.1-.9 2-2 2h-.6c1 1.6 2.7 2.4 4.6 2.4 2.8 0 5-2.2 5-5 0-.4 0-.8-.1-1.1z" />
      </svg>
      <span className="furniture-tune-label">{tr('Personnaliser')}</span>
    </button>
  );
}
