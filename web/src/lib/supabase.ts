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

// Les e-mails d'inscription et de mot de passe oublié contiennent un code à 6 chiffres (nos
// modèles, supabase/templates, envoyés par Brevo) : champ pour le code en plus du lien.
// false = lien seul (modèles de Supabase par défaut, sans code).
export const EMAIL_CODES = true;

// Adresse publique d'une jaquette validée
export function coverUrl(path: string): string {
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}
