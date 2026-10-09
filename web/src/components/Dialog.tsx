import { useEffect, useRef, type ReactNode } from 'react';

// Fenêtre modale accessible, basée sur l'élément <dialog> du navigateur
// (Échap pour fermer, focus gardé dans la fenêtre).
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">○</button>
      </div>
      <div className="dialog-body">{open && children}</div>
    </dialog>
  );
}
