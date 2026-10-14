import { tr } from './i18n';
// Messages d'erreur compréhensibles, sans dévoiler de détails techniques.
// (Pour la connexion, le message reste volontairement vague : il ne doit pas
// révéler si une adresse e-mail possède un compte.)

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: tr('E-mail ou mot de passe incorrect.'),
  email_not_confirmed: tr("Ton adresse e-mail n'est pas encore confirmée : clique sur le lien reçu par e-mail."),
  weak_password: tr('Mot de passe trop faible : 12 caractères minimum, avec minuscules, majuscules, chiffres et symboles.'),
  same_password: tr("Le nouveau mot de passe doit être différent de l'ancien."),
  over_email_send_rate_limit: tr("Trop d'e-mails envoyés : réessaie dans quelques minutes."),
  over_request_rate_limit: tr('Trop de tentatives : réessaie dans quelques minutes.'),
  mfa_verification_failed: tr('Code incorrect ou expiré.'),
  otp_expired: tr("Code incorrect ou expiré : vérifie-le, ou renvoie l'e-mail pour en recevoir un nouveau."),
  mfa_challenge_expired: tr('Code expiré : demande-en un nouveau.'),
  reauthentication_needed: tr('Pour des raisons de sécurité, confirme ton identité avec le code reçu par e-mail.'),
  reauthentication_not_valid: tr('Code de confirmation incorrect ou expiré.'),
  session_not_found: tr('Ta session a expiré : reconnecte-toi.'),
  insufficient_aal: tr('Cette action demande la double authentification.'),
  webauthn_challenge_expired: tr('Délai dépassé : réessaie.'),
  user_banned: tr('Ce compte est suspendu. Pour en savoir plus, écris-nous (adresse dans les mentions légales).'),
};

export function errorMessage(error: unknown): string {
  if (!error) return '';
  const e = error as { code?: string; message?: string; name?: string };
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];
  if (e.name === 'NotAllowedError' || e.code === 'ERROR_CEREMONY_ABORTED') return tr('Opération annulée.');
  if (e.message?.includes('row-level security')) return tr("Tu n'as pas les droits pour cette action (ou la double authentification est requise).");
  if (e.message?.toLowerCase().includes('passkeys are disabled')) return tr('Les passkeys ne sont pas encore activées sur le serveur (tableau de bord Supabase → Authentication → Passkeys).');
  if (e.message?.includes('Failed to fetch')) return tr('Connexion impossible : vérifie ta connexion internet.');
  // Envoi d'un e-mail raté côté serveur (service d'envoi indisponible ou mal réglé)
  if (/^Error sending .*e?mail/i.test(e.message ?? '')) return tr("L'e-mail n'a pas pu être envoyé : réessaie dans quelques minutes.");
  // Fonction ou table inconnue de l'API : le site est plus récent que la base
  if (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42883') return tr("Cette fonction n'est pas encore disponible : la base de données doit être mise à jour.");
  // Messages de la base (en français) : traduits s'ils sont connus
  return e.message ? tr(e.message) : tr('Une erreur est survenue.');
}
