import { useCallback, useEffect, useRef, useState } from 'react';
import { lang } from './i18n';

// Protection anti-robots (Cloudflare Turnstile) des pages d'inscription, de connexion et
// de mot de passe oublié. Supabase vérifie lui-même chaque jeton (Authentication → Attack
// Protection) : un robot qui appelle l'API directement, sans passer par le site, est
// refusé. Tant que la protection n'est pas activée côté Supabase, le jeton est ignoré.
// - Script chargé seulement sur ces pages (aucun appel à Cloudflare ailleurs).
// - « interaction-only » : la plupart des visiteurs ne voient rien ; un visiteur jugé
//   suspect voit une case à cocher.
// - Un jeton ne sert qu'une fois et expire au bout de 5 minutes : après chaque envoi, le
//   widget en prépare un nouveau.

// Clé publique du widget (Cloudflare → Turnstile) : visible dans le code, c'est voulu
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '0x4AAAAAAFaAhgNJScG8aMFy';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MS = 15_000;
// En dessous de cette largeur, la case de vérification prend sa forme compacte
const FLEXIBLE_MIN_WIDTH = 300;

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => { loading = null; script.remove(); reject(new Error('turnstile')); };
    document.head.append(script);
  });
  return loading;
}

// `action` : nom de la page pour les statistiques de Cloudflare (signup, login, recover).
// `container` se pose en ref sur un <div> : si ce <div> change (formulaire, puis écran
// « vérifie ta boîte mail »), le widget le suit.
export function useTurnstile(action: string) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((value: string | null) => void)[]>([]);
  // Script bloqué (bloqueur de publicité, réseau) : l'envoi se fait quand même sans jeton
  const [unavailable, setUnavailable] = useState(false);
  // Case à cocher affichée (visiteur jugé suspect)
  const [visible, setVisible] = useState(false);
  const failed = useRef(false);

  useEffect(() => {
    if (!element) return;
    let cancelled = false;
    const deliver = (value: string | null) => {
      token.current = value;
      if (value === null) return;
      failed.current = false;
      setUnavailable(false);
      for (const resolve of waiting.current.splice(0)) resolve(value);
    };
    const fail = () => {
      failed.current = true;
      setUnavailable(true);
      for (const resolve of waiting.current.splice(0)) resolve(null);
    };
    loadTurnstile().then((api) => {
      if (cancelled) return;
      widget.current = api.render(element, {
        sitekey: SITE_KEY,
        action,
        theme: 'dark',
        language: lang,
        appearance: 'interaction-only',
        size: element.clientWidth >= FLEXIBLE_MIN_WIDTH ? 'flexible' : 'compact',
        callback: (value: string) => deliver(value),
        'expired-callback': () => deliver(null),
        'before-interactive-callback': () => setVisible(true),
        'after-interactive-callback': () => setVisible(false),
        'error-callback': () => { deliver(null); fail(); },
        'unsupported-callback': () => fail(),
      });
    }).catch(() => { if (!cancelled) fail(); });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
      token.current = null;
      setVisible(false);
    };
  }, [action, element]);

  // Jeton pour un envoi : celui qui est prêt, sinon on l'attend (15 s au plus). Le widget
  // en prépare aussitôt un nouveau pour l'envoi suivant.
  const takeToken = useCallback(async (): Promise<string | undefined> => {
    let value = token.current;
    if (!value && failed.current) return undefined;
    if (!value) {
      value = await new Promise<string | null>((resolve) => {
        waiting.current.push(resolve);
        setTimeout(() => resolve(null), WAIT_MS);
      });
    }
    token.current = null;
    if (widget.current) window.turnstile?.reset(widget.current);
    return value ?? undefined;
  }, []);

  return { container: setElement, takeToken, unavailable, visible };
}
