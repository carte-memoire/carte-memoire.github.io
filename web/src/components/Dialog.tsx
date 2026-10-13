import { useEffect, useId, useRef, type ReactNode } from 'react';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Fenêtre modale accessible, basée sur l'élément <dialog> du navigateur
// (Échap pour fermer, focus gardé dans la fenêtre).
export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() place le curseur sur le premier bouton (« Fermer ») : on le rend
      // au champ marqué data-autofocus (l'autoFocus de React agit trop tôt, fenêtre encore fermée)
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={wide ? 'dialog dialog-wide' : 'dialog'} onClose={onClose} aria-labelledby={titleId}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr('Fermer')}><PsSymbol shape="circle" /></button>
      </div>
      <div className="dialog-body">{open && children}</div>
    </dialog>
  );
}
