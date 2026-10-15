import { tr } from './i18n';

// Mot de passe déjà divulgué dans une fuite de données connue ? (base « Have I Been Pwned »)
// Supabase ne propose cette vérification que dans ses offres payantes : le site la fait
// lui-même, sans jamais envoyer le mot de passe. Seuls les 5 premiers caractères de son
// empreinte SHA-1 partent ; le service renvoie toutes les empreintes qui commencent ainsi
// (plusieurs centaines, plus des fausses pour brouiller la réponse), et la comparaison se
// fait ici, dans le navigateur.
// Service injoignable : on ne bloque pas (null), les règles du mot de passe suffisent.
export async function passwordLeaked(password: string): Promise<boolean | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const suffix = hash.slice(5);
    return (await response.text()).split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}

export const LEAKED_PASSWORD_MESSAGE = tr('Ce mot de passe apparaît dans des fuites de données connues : des pirates l’essaient en priorité. Choisis-en un autre.');
