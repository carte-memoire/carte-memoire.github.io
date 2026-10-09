import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Configuration Supabase manquante : copier web/.env.example en web/.env.local et le remplir.');
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

// Adresse publique d'une jaquette validée
export function coverUrl(path: string): string {
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}
