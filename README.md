# Carte Mémoire

Base de données collaborative des jeux PlayStation, version par version (zones, éditions Platinum, codes produits, jaquettes), avec la gestion de sa collection personnelle.

- **Front** : React + TypeScript (Vite), thème inspiré de la PS1 — dossier [`web/`](web/)
- **Back** : [Supabase](https://supabase.com) (PostgreSQL, comptes, stockage des images) — dossier [`supabase/`](supabase/)
- **Données de départ** : Wikidata (CC0) et Wikipédia (CC BY-SA 4.0) — scripts dans [`scripts/`](scripts/)
- **Modèle de données** : [`docs/01-modele-de-donnees.md`](docs/01-modele-de-donnees.md)

## Lancer le site en local

```bash
cd web
npm install
cp .env.example .env.local   # puis y mettre l'adresse et la clé PUBLIQUE du projet Supabase
npm run dev                  # http://localhost:5173
```

## Site publié

https://carte-memoire.github.io — publié par GitHub Pages à chaque envoi sur `main`
(workflow [`.github/workflows/publier-le-site.yml`](.github/workflows/publier-le-site.yml)) : les tests de la base
doivent passer, puis le site est compilé et mis en ligne.

Réglages, une fois pour toutes, dans le dépôt GitHub :

- **Settings → Pages** : *Source* = **GitHub Actions** ;
- **Settings → Secrets and variables → Actions → Variables** : `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`
  (les valeurs de `web/.env.local` : uniquement la clé PUBLIQUE, le workflow refuse toute autre clé), et
  `VITE_CONTACT_EMAIL`, l'adresse de contact des pages légales (gardée hors du code : en changer ne laisse pas
  l'ancienne dans l'historique public).

Côté Supabase : `npx supabase config push` envoie l'adresse du site (redirections des e-mails) ; les passkeys se
règlent dans le tableau de bord (Authentication → Passkeys : `carte-memoire.github.io`).

## Base de données

Toute la structure est dans `supabase/migrations/`, appliquée dans l'ordre :

```bash
npx supabase db push          # envoie les nouvelles migrations
npx supabase config diff      # compare la configuration (comptes, sécurité) avec le projet
npx supabase config push      # l'envoie, après confirmation
```

Tests de la base (migrations, contraintes, règles de sécurité) : `supabase/tests/check-migrations.mjs`.

## Imports de données

Scripts dans `scripts/` (dépendances : `cd scripts && npm install`). Chacun écrit une migration SQL dans `supabase/migrations/`, à envoyer avec `npx supabase db push`.

| Script | Source | Contenu |
|---|---|---|
| `import-wikidata.mjs` | Wikidata (CC0) | Jeux d'une console, développeurs, genres, séries, dates |
| `import-wikipedia.mjs` | Wikipédia EN (CC BY-SA) | Liste complète des jeux d'une console, versions par région, éditeurs |
| `import-summaries.mjs` | Wikipédia FR (CC BY-SA) | Résumés (introduction des articles), avec lien source |
| `import-covers.mjs` | libretro-thumbnails | Jaquettes (recto) |

Les deux premiers prennent l'option `--console PS2` (sans option : la PlayStation ; consoles connues dans
[`scripts/lib/consoles.mjs`](scripts/lib/consoles.mjs)). Un jeu sorti sur plusieurs consoles (même élément
Wikidata) reste un seul jeu, avec ses versions de chaque console ; deux jeux de consoles différentes ne sont
jamais rapprochés par leur seul titre.

```bash
node scripts/import-wikidata.mjs --console PS2
node scripts/import-wikipedia.mjs --console PS2
```

Jaquettes, en trois temps :

```bash
node scripts/import-covers.mjs                 # analyse : combien de versions trouvent leur jaquette
node scripts/import-covers.mjs --telecharger   # télécharge, convertit en WebP dans .covers-import/
npx supabase storage cp -r .covers-import/upload/releases ss:///covers --linked --experimental --jobs 8 --content-type image/webp
npx supabase db query --linked -f .covers-import/link-covers.sql   # APRÈS l'envoi : rattache les images (rejouable)
```

## Sécurité

| Couche | Mesure |
|---|---|
| Comptes | Supabase Auth : mots de passe hachés (bcrypt), confirmation de l'e-mail, 12 caractères minimum avec minuscules, majuscules, chiffres et symboles |
| Connexion | Passkeys (sans mot de passe, résistantes au phishing), double authentification par application (TOTP), flux PKCE pour les liens reçus par e-mail |
| Sessions | Jetons courts renouvelés automatiquement, déconnexion des autres appareils après un changement de mot de passe, déconnexion globale possible |
| Base | Row Level Security sur toutes les tables, droits accordés colonne par colonne (impossible de se donner le rôle admin), fonctions internes hors de l'API |
| Double authentification exigée par la base | Écritures refusées si la session n'a pas validé le second facteur d'un compte qui l'a activé ; modérateurs et admins obligatoirement en double authentification |
| Images | Formats et poids limités par le stockage, chacun n'écrit que dans son dossier, images ré-encodées dans le navigateur (métadonnées GPS supprimées) |
| Navigateur | Politique de sécurité du contenu (CSP) sur le site publié, aucun HTML injecté, liens externes en `noopener` |

À faire avant d'ouvrir le site au public : serveur d'e-mails dédié (SMTP), CAPTCHA (Cloudflare Turnstile), adresse de production dans `config.toml` (redirections) et dans le tableau de bord Supabase → Authentication → Passkeys (les réglages de passkeys ne passent pas par `config push`).

## Licence des données

Le catalogue est publié sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr), car il reprend en partie des données de Wikipédia.
