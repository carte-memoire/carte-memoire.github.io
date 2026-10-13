import { createClient } from '@supabase/supabase-js';
import { tr } from './i18n';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(tr('Configuration Supabase manquante : copier web/.env.example en web/.env.local et le remplir.'));
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    // PKCE : les liens reçus par e-mail ne contiennent qu'un code à usage unique,
    // échangé contre une session par ce navigateur uniquement.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Les e-mails d'inscription et de mot de passe oublié contiennent-ils un code à 6 chiffres ?
// Seulement avec nos modèles d'e-mails (supabase/templates), que Supabase n'accepte qu'avec
// un service d'envoi dédié (SMTP). D'ici là : lien seul, et pas de champ pour le code.
export const EMAIL_CODES = false;

// Adresse publique d'une jaquette validée
export function coverUrl(path: string): string {
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}
