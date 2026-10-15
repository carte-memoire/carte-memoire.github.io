// =====================================================================
// security.txt (norme RFC 9116) : où signaler une faille de sécurité.
//
// Écrit dist/.well-known/security.txt après la compilation. La norme impose une
// date d'expiration de moins d'un an : le fichier est donc refait à chaque
// publication (le site se republie chaque nuit), avec une expiration à un an.
// Le contact est le formulaire privé de GitHub, pas une adresse e-mail (jamais
// d'adresse dans le code public).
//
// Usage (après « npm run build », dans web/) : node scripts/security-txt.mjs
// Variable : SITE_URL (https://carte-memoire.app par défaut)
// =====================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = (process.env.SITE_URL || 'https://carte-memoire.app').trim().replace(/\/+$/, '');
const REPO = 'https://github.com/carte-memoire/carte-memoire.github.io';
const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000);
expires.setUTCHours(0, 0, 0, 0);

const text = [
  `Contact: ${REPO}/security/advisories/new`,
  `Expires: ${expires.toISOString()}`,
  'Preferred-Languages: fr, en',
  `Canonical: ${SITE}/.well-known/security.txt`,
  `Policy: ${REPO}/blob/main/SECURITY.md`,
  '',
].join('\n');

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', '.well-known', 'security.txt');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, text);
console.log(`security.txt écrit (expire le ${expires.toISOString().slice(0, 10)})`);
