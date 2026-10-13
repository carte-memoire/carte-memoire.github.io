import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { forgetCompanies } from '../lib/useCompanies';
import { useConfirm } from './Confirm';
import { EMPTY_STUDIO, StudioField, type StudioValue } from './StudioField';
import { PsSymbol } from './PsSymbol';

// Modifier les développeurs d'un jeu ou les éditeurs d'une version (modérateurs) :
// les studios actuels en pastilles (✕ pour retirer), et un champ pour en ajouter un
// depuis la liste. Un studio absent de la liste n'est créé qu'après confirmation.
export function StudioListEditor({ title, studios, onAdd, onRemove, onSaved }: {
  title: string;
  studios: { id: number; name: string }[];
  onAdd: (companyId: number) => PromiseLike<{ error: unknown }>;
  onRemove: (companyId: number) => PromiseLike<{ error: unknown }>;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [value, setValue] = useState<StudioValue>(EMPTY_STUDIO);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = value.name.trim();
    if (!name) return;
    let id = value.id;
    setError('');
    if (id === null) {
      if (!(await confirm({
        title: 'Nouveau studio',
        message: `« ${name} » n'est pas dans la liste des studios. Vérifie d'abord qu'il existe bien (orthographe, Wikipédia) et qu'il n'y figure pas sous un autre nom. Le créer ?`,
        confirmLabel: 'Créer ce studio',
      }))) return;
      setBusy(true);
      const { data, error } = await supabase.from('company').insert({ name }).select('id').single();
      if (error) {
        setBusy(false);
        return setError(errorMessage(error));
      }
      forgetCompanies();
      id = data.id as number;
    }
    if (studios.some((s) => s.id === id)) {
      setBusy(false);
      return setError('Ce studio est déjà dans la liste.');
    }
    setBusy(true);
    const { error } = await onAdd(id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setValue(EMPTY_STUDIO);
    onSaved();
  }

  async function remove(id: number) {
    setBusy(true);
    setError('');
    const { error } = await onRemove(id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onSaved();
  }

  return (
    <div className="studio-editor">
      <p className="field-label">{title}</p>
      {studios.length > 0 ? (
        <ul className="genre-chips">
          {studios.map((s) => (
            <li key={s.id} className="genre-chip">
              {s.name}
              <button type="button" className="icon-button" onClick={() => remove(s.id)} disabled={busy} aria-label={`Retirer ${s.name}`} title="Retirer">✕</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Aucun pour le moment.</p>}
      <div className="studio-editor-add">
        <StudioField label={`Ajouter (${title.toLowerCase()})`} value={value} onChange={setValue} />
        <button type="button" className="button button-small" onClick={add} disabled={busy || !value.name.trim()}><PsSymbol shape="cross" /> Ajouter</button>
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
