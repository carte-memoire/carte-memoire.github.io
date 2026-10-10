// =====================================================================
// Carte Mémoire · E-mails envoyés par Supabase (inscription, mot de passe…)
//
// Écrit les modèles HTML dans supabase/templates/, aux couleurs du site et en
// français. Les variables {{ .Token }} (code à 6 chiffres), {{ .ConfirmationURL }}
// (lien)… sont remplies par Supabase à l'envoi.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/build-email-templates.mjs
// puis : npx supabase config diff, et npx supabase config push
//
// Mise en page pour les messageries : tableaux et styles écrits sur chaque
// élément (pas de feuille de style, pas de police téléchargée, pas d'image).
// =====================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'supabase', 'templates');
mkdirSync(OUT, { recursive: true });

// Couleurs du site (web/src/styles.css)
const C = {
  bg: '#0b0d1c', panel: '#1a1e38', bevel: '#3b4170', text: '#e8eaf4', muted: '#9ba1c2',
  triangle: '#2fd6a6', circle: '#ff5a6e', cross: '#7b93ff', square: '#ff86d9', button: '#4a5fd6',
};
const SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

const h1 = (text) => `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:21px;line-height:1.3;color:#ffffff;">${text}</h1>`;
const p = (text) => `<p style="margin:0 0 14px;">${text}</p>`;
const small = (text) => `<p style="margin:14px 0 0;font-size:13px;color:${C.muted};">${text}</p>`;
const code = `<div style="margin:6px 0 18px;padding:14px 10px;text-align:center;background:${C.bg};border:1px dashed ${C.cross};border-radius:6px;font-family:${MONO};font-size:34px;font-weight:bold;letter-spacing:10px;color:#ffffff;">{{ .Token }}</div>`;
const button = (label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;"><tr>
  <td bgcolor="${C.button}" style="border-radius:4px;background:${C.button};">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">${label}</a>
  </td></tr></table>`;
const fallbackLink = small(`Le bouton ne marche pas ? Copie ce lien dans ton navigateur :<br><a href="{{ .ConfirmationURL }}" style="color:${C.cross};word-break:break-all;">{{ .ConfirmationURL }}</a>`);

function layout({ title, preheader, body, footer }) {
  return `<!doctype html>
<html lang="fr">
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
      <a href="{{ .SiteURL }}" style="color:${C.cross};">Carte Mémoire</a> · le catalogue collaboratif des jeux vidéo, gratuit et sans publicité.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`;
}

const NOT_ME = "Tu reçois cet e-mail parce que cette adresse a été utilisée sur Carte Mémoire.";

// Modèles d'e-mails liés à une action (lien et/ou code)
const templates = {
  confirmation: {
    subject: 'Confirme ton adresse e-mail · Carte Mémoire',
    preheader: 'Ton code pour activer ton compte, valable 30 minutes.',
    body: [
      h1('Bienvenue sur Carte Mémoire !'),
      p("Pour activer ton compte, entre ce code sur la page d'inscription :"),
      code,
      p('Ou clique sur ce bouton :'),
      button('&#10005;&nbsp; Confirmer mon adresse'),
      p('Le code et le lien sont valables 30 minutes.'),
      small("Tu n'as pas créé de compte ? Ignore cet e-mail : rien ne sera activé."),
      fallbackLink,
    ],
  },
  recovery: {
    subject: 'Ton code pour changer de mot de passe · Carte Mémoire',
    preheader: 'Entre ce code sur la page « Mot de passe oublié », depuis n’importe quel appareil.',
    body: [
      h1('Changer de mot de passe'),
      p('Pour choisir un nouveau mot de passe, entre ce code sur la page « Mot de passe oublié », depuis n’importe quel appareil :'),
      code,
      p('Ou clique sur ce bouton, dans le navigateur où tu as fait la demande :'),
      button('&#10005;&nbsp; Choisir un nouveau mot de passe'),
      p('Le code et le lien sont valables 30 minutes.'),
      small("Tu n'as rien demandé ? Ignore cet e-mail : ton mot de passe ne change pas."),
      fallbackLink,
    ],
  },
  reauthentication: {
    subject: 'Ton code de confirmation · Carte Mémoire',
    preheader: 'Pour confirmer le changement de ton mot de passe.',
    body: [
      h1('Confirme que c’est bien toi'),
      p('Pour changer ton mot de passe, entre ce code dans « Mon compte » :'),
      code,
      p('Il est valable 30 minutes.'),
      small("Tu n'as rien demandé ? Quelqu'un est peut-être connecté à ton compte : change ton mot de passe et déconnecte tous les appareils depuis « Mon compte »."),
    ],
  },
  email_change: {
    subject: 'Confirme ta nouvelle adresse e-mail · Carte Mémoire',
    preheader: 'Pour confirmer le changement d’adresse de ton compte.',
    body: [
      h1('Changement d’adresse e-mail'),
      p('Une demande a été faite pour remplacer <strong>{{ .Email }}</strong> par <strong>{{ .NewEmail }}</strong> sur ton compte Carte Mémoire.'),
      p('Pour la confirmer, clique sur ce bouton :'),
      button('&#10005;&nbsp; Confirmer le changement'),
      p('Le lien est valable 30 minutes.'),
      small("Tu n'as rien demandé ? Ignore cet e-mail et change ton mot de passe dans « Mon compte »."),
      fallbackLink,
    ],
  },
  magic_link: {
    subject: 'Ton lien de connexion · Carte Mémoire',
    preheader: 'Pour te connecter à Carte Mémoire, valable 30 minutes.',
    body: [
      h1('Connexion à Carte Mémoire'),
      p('Pour te connecter, entre ce code :'),
      code,
      p('Ou clique sur ce bouton :'),
      button('&#10005;&nbsp; Me connecter'),
      small("Tu n'as rien demandé ? Ignore cet e-mail."),
      fallbackLink,
    ],
  },
  invite: {
    subject: 'Tu es invité sur Carte Mémoire',
    preheader: 'Crée ton compte pour rejoindre Carte Mémoire.',
    body: [
      h1('Tu es invité sur Carte Mémoire'),
      p('Pour accepter l’invitation et créer ton compte, clique sur ce bouton :'),
      button('&#10005;&nbsp; Accepter l’invitation'),
      small("Tu ne t'attendais pas à cette invitation ? Ignore cet e-mail."),
      fallbackLink,
    ],
  },
};

// E-mails de sécurité : prévenir la personne d'un changement sur son compte
const SECURITY = "Ce n'est pas toi ? Utilise tout de suite « Mot de passe oublié » sur le site, puis « Se déconnecter de tous les appareils » dans « Mon compte ».";
const notifications = {
  password_changed: {
    subject: 'Ton mot de passe a été changé · Carte Mémoire',
    title: 'Mot de passe changé',
    text: 'Le mot de passe de ton compte Carte Mémoire (<strong>{{ .Email }}</strong>) vient d’être changé.',
  },
  email_changed: {
    subject: 'Ton adresse e-mail a été changée · Carte Mémoire',
    title: 'Adresse e-mail changée',
    text: 'L’adresse de ton compte Carte Mémoire est passée de <strong>{{ .OldEmail }}</strong> à <strong>{{ .Email }}</strong>.',
  },
  mfa_factor_enrolled: {
    subject: 'Double authentification activée · Carte Mémoire',
    title: 'Double authentification activée',
    text: 'Une nouvelle méthode de vérification ({{ .FactorType }}) vient d’être ajoutée à ton compte Carte Mémoire.',
  },
  mfa_factor_unenrolled: {
    subject: 'Double authentification désactivée · Carte Mémoire',
    title: 'Double authentification désactivée',
    text: 'Une méthode de vérification ({{ .FactorType }}) vient d’être retirée de ton compte Carte Mémoire : il est maintenant moins protégé.',
  },
};

const written = [];
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(join(OUT, `${name}.html`), layout({ title: t.subject, preheader: t.preheader, body: t.body.join('\n'), footer: NOT_ME }));
  written.push(name);
}
for (const [name, n] of Object.entries(notifications)) {
  writeFileSync(join(OUT, `${name}.html`), layout({
    title: n.subject,
    preheader: n.title,
    body: [h1(n.title), p(n.text), small(SECURITY)].join('\n'),
    footer: 'Cet e-mail de sécurité t’est envoyé à chaque changement important sur ton compte.',
  }));
  written.push(name);
}
console.log(`${written.length} modèles écrits dans supabase/templates/ : ${written.join(', ')}`);
// Pour config.toml : les sujets, à recopier si on les change ici
console.log(Object.entries({ ...templates, ...notifications }).map(([n, t]) => `  ${n} : ${t.subject}`).join('\n'));
