import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastMessage {
  text: string;
  // Ajout ou modification enregistrés : la carte mémoire s'écrit, puis la coche
  saved?: boolean;
  error?: boolean;
  action?: { label: string; onClick: () => void };
}

// Une carte mémoire (sans marque) : la barre se remplit par blocs, puis la coche
export function SaveIcon() {
  return (
    <svg className="save-icon" viewBox="0 0 20 26" aria-hidden="true" focusable="false">
      <path className="save-card" d="M2.5 1.5h11l4 4v19h-15z" />
      <rect className="save-label" x="5" y="4.5" width="8" height="7" rx="1" />
      <path className="save-check" d="M6.6 8.2l1.7 1.7 3.2-3.4" />
      <rect className="save-track" x="5" y="16" width="10" height="4.5" rx="1" />
      <rect className="save-fill" x="5" y="16" width="10" height="4.5" rx="1" />
    </svg>
  );
}

// Message en bas de l'écran, retiré après quelques secondes ; un nouveau message
// remplace le précédent (et rejoue son animation)
export function useToast(duration = 6000): { toast: ReactNode; show: (message: ToastMessage) => void; hide: () => void } {
  const [current, setCurrent] = useState<(ToastMessage & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counter = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((message: ToastMessage) => {
    clearTimeout(timer.current);
    counter.current += 1;
    setCurrent({ ...message, id: counter.current });
    timer.current = setTimeout(() => setCurrent(null), duration);
  }, [duration]);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const toast = current && (
    <div key={current.id} className={current.error ? 'toast toast-error' : current.saved ? 'toast toast-saved' : 'toast'} role="status">
      {current.saved && <SaveIcon />}
      <span>{current.text}</span>
      {current.action && <button type="button" className="link-button" onClick={current.action.onClick}>{current.action.label}</button>}
    </div>
  );
  return { toast, show, hide };
}
