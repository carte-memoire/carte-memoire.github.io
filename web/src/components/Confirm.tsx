import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';

// Fenêtre de confirmation intégrée au site, à la place de window.confirm()
// (que certains navigateurs intégrés bloquent en silence en répondant « non »).
//
//   const confirm = useConfirm();
//   if (!(await confirm({ message: 'Supprimer ?', danger: true }))) return;

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  function close(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onClose={() => close(false)} title={options?.title ?? tr('Confirmation')}>
        {options && (
          <>
            <div className="confirm-message">{options.message}</div>
            <div className="actions">
              <button type="button" className="button" onClick={() => close(false)}>
                <PsSymbol shape="circle" /> {options.cancelLabel ?? tr('Annuler')}
              </button>
              <button type="button" className={`button ${options.danger ? 'button-danger' : 'button-primary'}`} onClick={() => close(true)} autoFocus>
                <PsSymbol shape="cross" /> {options.confirmLabel ?? tr('Confirmer')}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error(tr('useConfirm doit être utilisé dans <ConfirmProvider>'));
  return ctx;
}
