import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Double authentification sans code : navigateur de confiance (30 jours, voir la
// migration 20261010191800_trusted_browsers.sql) ou connexion par passkey.

const tokenKey = (userId: string) => `carte-memoire:navigateur-de-confiance:${userId}`;

export function trustToken(userId: string): string | null {
  try { return localStorage.getItem(tokenKey(userId)); } catch { return null; }
}
export function rememberTrust(userId: string, token: string) {
  try { localStorage.setItem(tokenKey(userId), token); } catch { /* stockage indisponible : le code restera demandé */ }
}
export function forgetTrust(userId: string) {
  try { localStorage.removeItem(tokenKey(userId)); } catch { /* rien à effacer */ }
}

// « Firefox sur Windows », « Safari sur iPhone »… pour s'y retrouver dans Mon compte
export function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return system ? `${browser} · ${system}` : browser;
}

// Session ouverte avec une passkey : deux facteurs en un, pas de code
const PASSKEY_METHODS = new Set(['passkey', 'webauthn', 'mfa/webauthn']);
export function passkeySession(methods: { method: string }[] | undefined): boolean {
  return Boolean(methods?.some((m) => PASSKEY_METHODS.has(m.method)));
}

// Identifiant de la session (dans le jeton d'accès), le même après chaque rafraîchissement
function sessionId(session: Session): string {
  try {
    return (JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: string }).session_id ?? '';
  } catch {
    return '';
  }
}

// Ce navigateur est-il de confiance ? Il présente son jeton ; s'il ne vaut plus rien
// (expiré, retiré, mot de passe changé), il l'oublie.
const recognized = new Set<string>();
export async function presentTrustedBrowser(session: Session): Promise<boolean> {
  const token = trustToken(session.user.id);
  if (!token) return false;
  // Une seule vérification par session (le jeton reste reconnu côté base)
  const sessionKey = `${session.user.id}:${sessionId(session)}`;
  if (recognized.has(sessionKey)) return true;
  const { data, error } = await supabase.rpc('use_trusted_browser', { token });
  if (error) return false;
  if (data !== true) {
    forgetTrust(session.user.id);
    return false;
  }
  recognized.add(sessionKey);
  return true;
}

// Après connexion : faut-il encore le code à 6 chiffres ?
export async function codeStillNeeded(session: Session): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2')) return false;
  if (passkeySession(data.currentAuthenticationMethods as { method: string }[] | undefined)) return false;
  return !(await presentTrustedBrowser(session));
}
