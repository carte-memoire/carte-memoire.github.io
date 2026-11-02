import type { SpecField } from '../../lib/types';
import { specText } from '../../lib/specs';
import { tr } from '../../lib/i18n';

// Caractéristiques propres à la console (blocs de carte mémoire, manette analogique…).
// « Non précisé » retire la valeur : on ne confond pas « inconnu » et « non ».
export function SpecsEditor({ fields, value, onChange }: { fields: SpecField[]; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  function set(key: string, v: unknown) {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  }
  return (
    <fieldset className="specs-editor">
      <legend className="field-label">{tr('Caractéristiques')}</legend>
      <div className="row">
        {fields.filter((f) => f.type !== 'multi_choice').map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">{specText(f.label)}</span>
            {f.type === 'integer' && (
              <input type="number" min={f.min} max={f.max} value={value[f.key] === undefined ? '' : String(value[f.key])}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} placeholder={tr('Non précisé')} />
            )}
            {f.type === 'boolean' && (
              <select value={value[f.key] === true ? 'yes' : value[f.key] === false ? 'no' : ''}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : e.target.value === 'yes')}>
                <option value="">{tr('Non précisé')}</option>
                <option value="yes">{tr('Oui')}</option>
                <option value="no">{tr('Non')}</option>
              </select>
            )}
            {f.type === 'choice' && (
              <select value={typeof value[f.key] === 'string' ? (value[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value || undefined)}>
                <option value="">{tr('Non précisé')}</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{specText(o.label)}</option>)}
              </select>
            )}
          </label>
        ))}
      </div>
      {fields.filter((f) => f.type === 'multi_choice').map((f) => {
        const list = Array.isArray(value[f.key]) ? (value[f.key] as string[]) : [];
        return (
          <fieldset key={f.key} className="checks">
            <legend className="field-label">{specText(f.label)}</legend>
            {f.options?.map((o) => (
              <label key={o.value}>
                <input type="checkbox" checked={list.includes(o.value)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value);
                    set(f.key, next.length ? next : undefined);
                  }} />
                {specText(o.label)}
              </label>
            ))}
          </fieldset>
        );
      })}
    </fieldset>
  );
}
