// Carte Mémoire · Textes du site sans traduction anglaise
//
// Liste les textes passés à tr('…') (web/src) absents du dictionnaire anglais
// (web/src/lib/i18n-en.ts). À lancer après avoir ajouté du texte au site :
//   node scripts/check-translations.mjs
// Puis ajouter chaque phrase manquante au dictionnaire (« texte français » : « English text »).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'src');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name) && !/i18n(-en)?\.ts$/.test(name)) files.push(path);
  }
})(SRC);

const dictionary = readFileSync(join(SRC, 'lib', 'i18n-en.ts'), 'utf8');
const known = new Set([...dictionary.matchAll(/^\s+("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
// Premier argument de tr(…) écrit en toutes lettres : 'texte', "texte" (sans variable)
const call = /\btr\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;

const missing = new Map();
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(call)) {
    const raw = m[1];
    const text = raw.slice(1, -1).replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n').trim();
    if (text && !known.has(text)) missing.set(text, file.slice(SRC.length + 1));
  }
}
for (const [text, file] of missing) console.log(`${file} : ${text}`);
console.log(missing.size ? `\n${missing.size} texte(s) sans traduction anglaise` : 'Tous les textes ont leur traduction anglaise.');
