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

## Base de données

Toute la structure est dans `supabase/migrations/`, appliquée dans l'ordre :

```bash
npx supabase db push          # envoie les nouvelles migrations
npx supabase config diff      # compare la configuration (comptes, sécurité) avec le projet
npx supabase config push      # l'envoie, après confirmation
```

Tests de la base (migrations, contraintes, règles de sécurité) : `supabase/tests/check-migrations.mjs`.

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

À faire avant d'ouvrir le site au public : serveur d'e-mails dédié (SMTP), CAPTCHA (Cloudflare Turnstile), adresse de production dans `config.toml` (redirections et passkeys).

## Licence des données

Le catalogue est publié sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr), car il reprend en partie des données de Wikipédia.
