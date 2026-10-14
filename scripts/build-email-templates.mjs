// =====================================================================
// Carte Mémoire · E-mails envoyés par Supabase (inscription, mot de passe…)
//
// Écrit les modèles HTML dans supabase/templates/, aux couleurs du site, en
// français et en anglais : chaque e-mail part dans la langue du site choisie par
// le membre (gardée avec son compte : user_metadata.lang, « fr » par défaut).
// Les variables {{ .Token }} (code à 6 chiffres), {{ .ConfirmationURL }} (lien)…
// sont remplies par Supabase à l'envoi. Les sujets sont recopiés dans
// supabase/config.toml par ce script.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/build-email-templates.mjs [dossier d'aperçus]
// puis : npx supabase config push (il affiche les changements avant de les envoyer)
// Avec un dossier d'aperçus : chaque e-mail y est aussi écrit en français et en
// anglais, variables remplies par des exemples, pour le regarder dans un navigateur.
//
// Mise en page pour les messageries : tableaux et styles écrits sur chaque
// élément (pas de feuille de style, pas de police téléchargée, pas d'image).
// =====================================================================

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'supabase', 'templates');
const CONFIG = join(ROOT, 'supabase', 'config.toml');
const PREVIEW = process.argv[2] ?? null;
mkdirSync(OUT, { recursive: true });

// Couleurs du site (web/src/styles.css)
const C = {
  bg: '#0b0d1c', panel: '#1a1e38', bevel: '#3b4170', text: '#e8eaf4', muted: '#9ba1c2',
  triangle: '#2fd6a6', circle: '#ff5a6e', cross: '#7b93ff', square: '#ff86d9', button: '#4a5fd6',
};
const SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

// Langue du compte : « en » → anglais, tout le reste (rien, « fr »…) → français.
// printf tolère une valeur absente (compte créé avant le choix de langue).
const IF_EN = '{{ if eq (printf "%v" .Data.lang) "en" }}';
const bilingual = (fr, en) => `${IF_EN}${en}{{ else }}${fr}{{ end }}`;

function build(lang) {
  const t = (fr, en) => (lang === 'en' ? en : fr);
  const h1 = (text) => `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:21px;line-height:1.3;color:#ffffff;">${text}</h1>`;
  const p = (text) => `<p style="margin:0 0 14px;">${text}</p>`;
  const small = (text) => `<p style="margin:14px 0 0;font-size:13px;color:${C.muted};">${text}</p>`;
  const code = `<div style="margin:6px 0 18px;padding:14px 10px;text-align:center;background:${C.bg};border:1px dashed ${C.cross};border-radius:6px;font-family:${MONO};font-size:34px;font-weight:bold;letter-spacing:10px;color:#ffffff;">{{ .Token }}</div>`;
  const button = (label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;"><tr>
  <td bgcolor="${C.button}" style="border-radius:4px;background:${C.button};">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">&#10005;&nbsp; ${label}</a>
  </td></tr></table>`;
  const fallbackLink = small(`${t('Le bouton ne marche pas ? Copie ce lien dans ton navigateur :', "The button doesn't work? Copy this link into your browser:")}<br><a href="{{ .ConfirmationURL }}" style="color:${C.cross};word-break:break-all;">{{ .ConfirmationURL }}</a>`);
  const valid30 = t('Le code et le lien sont valables 30 minutes.', 'The code and the link are valid for 30 minutes.');

  function layout({ title, preheader, body, footer }) {
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td align="center" style="padding:0 0 20px;">
      <div style="font-family:${MONO};font-size:24px;font-weight:bold;letter-spacing:3px;color:${C.text};">CARTE MÉMOIRE</div>
      <div style="padding-top:8px;font-family:${SANS};font-size:18px;letter-spacing:8px;">
        <span style="color:${C.triangle};">&#9651;</span><span style="color:${C.circle};">&#9675;</span><span style="color:${C.cross};">&#10005;</span><span style="color:${C.square};font-size:22px;">&#9633;</span>
      </div>
    </td></tr>
    <tr><td bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.bevel};border-radius:6px;padding:28px 26px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.text};">
${body}
    </td></tr>
    <tr><td style="padding:18px 10px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">
      ${footer}<br>
      <a href="{{ .SiteURL }}" style="color:${C.cross};">Carte Mémoire</a> · ${t('le catalogue collaboratif des jeux vidéo, gratuit et sans publicité.', 'the collaborative video game catalogue, free and ad-free.')}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`;
  }

  const notMe = t('Tu reçois cet e-mail parce que cette adresse a été utilisée sur Carte Mémoire.', 'You are receiving this email because this address was used on Carte Mémoire.');

  // E-mails liés à une action (lien et/ou code)
  const templates = {
    confirmation: {
      subject: t('Confirme ton adresse e-mail · Carte Mémoire', 'Confirm your email address · Carte Mémoire'),
      preheader: t('Ton code pour activer ton compte, valable 30 minutes.', 'Your code to activate your account, valid for 30 minutes.'),
      body: [
        h1(t('Bienvenue sur Carte Mémoire !', 'Welcome to Carte Mémoire!')),
        p(t("Pour activer ton compte, entre ce code sur la page d'inscription :", 'To activate your account, enter this code on the sign-up page:')),
        code,
        p(t('Ou clique sur ce bouton :', 'Or click this button:')),
        button(t('Confirmer mon adresse', 'Confirm my address')),
        p(valid30),
        small(t("Tu n'as pas créé de compte ? Ignore cet e-mail : rien ne sera activé.", "Didn't create an account? Ignore this email: nothing will be activated.")),
        fallbackLink,
      ],
    },
    recovery: {
      subject: t('Ton code pour changer de mot de passe · Carte Mémoire', 'Your code to change your password · Carte Mémoire'),
      preheader: t('Entre ce code sur la page « Mot de passe oublié », depuis n’importe quel appareil.', 'Enter this code on the “Forgot password” page, from any device.'),
      body: [
        h1(t('Changer de mot de passe', 'Change your password')),
        p(t('Pour choisir un nouveau mot de passe, entre ce code sur la page « Mot de passe oublié », depuis n’importe quel appareil :', 'To choose a new password, enter this code on the “Forgot password” page, from any device:')),
        code,
        p(t('Ou clique sur ce bouton, dans le navigateur où tu as fait la demande :', 'Or click this button, in the browser where you made the request:')),
        button(t('Nouveau mot de passe', 'Choose a new password')),
        p(valid30),
        small(t("Tu n'as rien demandé ? Ignore cet e-mail : ton mot de passe ne change pas.", "Didn't ask for anything? Ignore this email: your password stays the same.")),
        fallbackLink,
      ],
    },
    reauthentication: {
      subject: t('Ton code de confirmation · Carte Mémoire', 'Your confirmation code · Carte Mémoire'),
      preheader: t('Pour confirmer le changement de ton mot de passe.', 'To confirm your password change.'),
      body: [
        h1(t('Confirme que c’est bien toi', 'Confirm it’s really you')),
        p(t('Pour changer ton mot de passe, entre ce code dans « Mon compte » :', 'To change your password, enter this code in “My account”:')),
        code,
        p(t('Il est valable 30 minutes.', 'It is valid for 30 minutes.')),
        small(t("Tu n'as rien demandé ? Quelqu'un est peut-être connecté à ton compte : change ton mot de passe et déconnecte tous les appareils depuis « Mon compte ».",
          "Didn't ask for anything? Someone may be signed in to your account: change your password and sign out of all devices from “My account”.")),
      ],
    },
    email_change: {
      subject: t('Confirme ta nouvelle adresse e-mail · Carte Mémoire', 'Confirm your new email address · Carte Mémoire'),
      preheader: t('Pour confirmer le changement d’adresse de ton compte.', 'To confirm the new address for your account.'),
      body: [
        h1(t('Changement d’adresse e-mail', 'Email address change')),
        p(t('Une demande a été faite pour remplacer <strong>{{ .Email }}</strong> par <strong>{{ .NewEmail }}</strong> sur ton compte Carte Mémoire.',
          'A request was made to replace <strong>{{ .Email }}</strong> with <strong>{{ .NewEmail }}</strong> on your Carte Mémoire account.')),
        p(t('Pour la confirmer, clique sur ce bouton :', 'To confirm it, click this button:')),
        button(t('Confirmer le changement', 'Confirm the change')),
        p(t('Le lien est valable 30 minutes.', 'The link is valid for 30 minutes.')),
        small(t("Tu n'as rien demandé ? Ignore cet e-mail et change ton mot de passe dans « Mon compte ».", "Didn't ask for anything? Ignore this email and change your password in “My account”.")),
        fallbackLink,
      ],
    },
    magic_link: {
      subject: t('Ton lien de connexion · Carte Mémoire', 'Your sign-in link · Carte Mémoire'),
      preheader: t('Pour te connecter à Carte Mémoire, valable 30 minutes.', 'To sign in to Carte Mémoire, valid for 30 minutes.'),
      body: [
        h1(t('Connexion à Carte Mémoire', 'Sign in to Carte Mémoire')),
        p(t('Pour te connecter, entre ce code :', 'To sign in, enter this code:')),
        code,
        p(t('Ou clique sur ce bouton :', 'Or click this button:')),
        button(t('Me connecter', 'Sign me in')),
        small(t("Tu n'as rien demandé ? Ignore cet e-mail.", "Didn't ask for anything? Ignore this email.")),
        fallbackLink,
      ],
    },
    invite: {
      subject: t('Tu es invité sur Carte Mémoire', 'You have been invited to Carte Mémoire'),
      preheader: t('Crée ton compte pour rejoindre Carte Mémoire.', 'Create your account to join Carte Mémoire.'),
      body: [
        h1(t('Tu es invité sur Carte Mémoire', 'You have been invited to Carte Mémoire')),
        p(t('Pour accepter l’invitation et créer ton compte, clique sur ce bouton :', 'To accept the invitation and create your account, click this button:')),
        button(t('Accepter l’invitation', 'Accept the invitation')),
        small(t("Tu ne t'attendais pas à cette invitation ? Ignore cet e-mail.", "Weren't expecting this invitation? Ignore this email.")),
        fallbackLink,
      ],
    },
  };

  // E-mails de sécurité : prévenir la personne d'un changement sur son compte
  const security = t("Ce n'est pas toi ? Utilise tout de suite « Mot de passe oublié » sur le site, puis « Se déconnecter de tous les appareils » dans « Mon compte ».",
    'Wasn’t you? Right away, use “Forgot password” on the site, then “Sign out of all devices” in “My account”.');
  const notifications = {
    password_changed: {
      subject: t('Ton mot de passe a été changé · Carte Mémoire', 'Your password has been changed · Carte Mémoire'),
      title: t('Mot de passe changé', 'Password changed'),
      text: t('Le mot de passe de ton compte Carte Mémoire (<strong>{{ .Email }}</strong>) vient d’être changé.', 'The password of your Carte Mémoire account (<strong>{{ .Email }}</strong>) has just been changed.'),
    },
    email_changed: {
      subject: t('Ton adresse e-mail a été changée · Carte Mémoire', 'Your email address has been changed · Carte Mémoire'),
      title: t('Adresse e-mail changée', 'Email address changed'),
      text: t('L’adresse de ton compte Carte Mémoire est passée de <strong>{{ .OldEmail }}</strong> à <strong>{{ .Email }}</strong>.', 'The address of your Carte Mémoire account changed from <strong>{{ .OldEmail }}</strong> to <strong>{{ .Email }}</strong>.'),
    },
    mfa_factor_enrolled: {
      subject: t('Double authentification activée · Carte Mémoire', 'Two-factor authentication enabled · Carte Mémoire'),
      title: t('Double authentification activée', 'Two-factor authentication enabled'),
      text: t('Une nouvelle méthode de vérification ({{ .FactorType }}) vient d’être ajoutée à ton compte Carte Mémoire.', 'A new verification method ({{ .FactorType }}) has just been added to your Carte Mémoire account.'),
    },
    mfa_factor_unenrolled: {
      subject: t('Double authentification désactivée · Carte Mémoire', 'Two-factor authentication disabled · Carte Mémoire'),
      title: t('Double authentification désactivée', 'Two-factor authentication disabled'),
      text: t('Une méthode de vérification ({{ .FactorType }}) vient d’être retirée de ton compte Carte Mémoire : il est maintenant moins protégé.', 'A verification method ({{ .FactorType }}) has just been removed from your Carte Mémoire account: it is now less protected.'),
    },
  };

  const mails = {};
  for (const [name, m] of Object.entries(templates)) {
    mails[name] = { kind: 'template', subject: m.subject, html: layout({ title: m.subject, preheader: m.preheader, body: m.body.join('\n'), footer: notMe }) };
  }
  for (const [name, n] of Object.entries(notifications)) {
    mails[name] = {
      kind: 'notification',
      subject: n.subject,
      html: layout({
        title: n.subject,
        preheader: n.title,
        body: [h1(n.title), p(n.text), small(security)].join('\n'),
        footer: t('Cet e-mail de sécurité t’est envoyé à chaque changement important sur ton compte.', 'This security email is sent to you whenever something important changes on your account.'),
      }),
    };
  }
  return mails;
}

const fr = build('fr');
const en = build('en');

// Modèles : les deux langues dans chaque fichier
for (const name of Object.keys(fr)) writeFileSync(join(OUT, `${name}.html`), bilingual(fr[name].html, en[name].html));

// Sujets dans config.toml (blocs actifs ou encore en commentaire « # ») ; en chaîne
// littérale TOML (apostrophes simples), d'où l'interdiction des « ' » dans les sujets
let config = readFileSync(CONFIG, 'utf8');
for (const name of Object.keys(fr)) {
  const subject = bilingual(fr[name].subject, en[name].subject);
  if (subject.includes("'")) throw new Error(`Sujet avec une apostrophe droite (${name}) : utiliser ’`);
  const pattern = new RegExp(`(\\[auth\\.email\\.${fr[name].kind}\\.${name}\\]\\r?\\n(?:#? ?enabled = true\\r?\\n)?#? ?subject = )[^\\r\\n]*`);
  if (!pattern.test(config)) throw new Error(`Bloc [auth.email.${fr[name].kind}.${name}] introuvable dans config.toml`);
  config = config.replace(pattern, (_, start) => `${start}'${subject}'`);
}
writeFileSync(CONFIG, config);

// Aperçus : variables remplies par des exemples
if (PREVIEW) {
  mkdirSync(PREVIEW, { recursive: true });
  const sample = {
    '{{ .Token }}': '482915', '{{ .ConfirmationURL }}': 'https://carte-memoire.app/connexion?confirme=1&amp;token=exemple',
    '{{ .SiteURL }}': 'https://carte-memoire.app', '{{ .Email }}': 'joueur@exemple.fr', '{{ .NewEmail }}': 'nouvelle@exemple.fr',
    '{{ .OldEmail }}': 'ancienne@exemple.fr', '{{ .FactorType }}': 'totp',
  };
  const fill = (html) => Object.entries(sample).reduce((text, [key, value]) => text.split(key).join(value), html);
  for (const [lang, mails] of [['fr', fr], ['en', en]]) {
    for (const [name, m] of Object.entries(mails)) writeFileSync(join(PREVIEW, `${name}.${lang}.html`), fill(m.html));
  }
}

console.log(`${Object.keys(fr).length} modèles bilingues écrits dans supabase/templates/ ; sujets recopiés dans supabase/config.toml${PREVIEW ? ` ; aperçus dans ${PREVIEW}` : ''}`);
