import { useEffect, useState } from 'react';

// Installation du site comme application (icône sur l'écran d'accueil, plein écran) :
// manifest.webmanifest + icônes (scripts/build-icons.mjs). Chrome et Edge préviennent
// par l'événement beforeinstallprompt, qu'on garde pour proposer l'installation au
// bon moment (le scanner, en brocante). Safari sur iPhone n'a pas d'événement : on
// explique le geste (Partager → Sur l'écran d'accueil).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'carte-memoire:installation-masquee';
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// À appeler au chargement de la page (main.tsx), avant que le navigateur n'émette l'événement
export function watchInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

// Déjà ouvert comme application (depuis l'écran d'accueil)
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

// iPhone et iPad (y compris l'iPad qui se présente comme un Mac) : pas de proposition
// automatique, le geste se fait dans le menu Partager de Safari
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function hidden(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export type InstallState = { kind: 'installed' } | { kind: 'hidden' } | { kind: 'prompt'; install: () => Promise<void> } | { kind: 'ios' } | { kind: 'none' };

// Ce que la page peut proposer : un bouton (Chrome, Edge…), le geste iOS, ou rien
export function useInstall(): { state: InstallState; hide: () => void } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const hide = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* sans stockage : la proposition reviendra */ }
    setTick((n) => n + 1);
  };

  let state: InstallState;
  if (isStandalone()) state = { kind: 'installed' };
  else if (hidden()) state = { kind: 'hidden' };
  else if (deferred) {
    const event = deferred;
    state = {
      kind: 'prompt',
      install: async () => {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === 'accepted') deferred = null;
        notify();
      },
    };
  } else if (isIos()) state = { kind: 'ios' };
  else state = { kind: 'none' };
  return { state, hide };
}
