// =====================================================================
// Carte Mémoire · Manette analogique et vibrations (libretro-database)
//
// libretro-database (CC BY-SA) liste, par code produit, les jeux PS1 qui
// utilisent la manette analogique (metadat/analog) et les vibrations
// (metadat/rumble). La liste est partielle (~240 jeux chacune) : on ne s'en
// sert que pour cocher des cas connus, jamais pour affirmer « non ».
// Une valeur déjà saisie n'est jamais écrasée.
//
// Usage (depuis le dossier carte-memoire) :
//   node scripts/import-specs-libretro.mjs   → écrit la migration
// =====================================================================

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, USER_AGENT } from './lib/redump.mjs';

const BASE = 'https://raw.githubusercontent.com/libretro/libretro-database/master/metadat';

async function serials(kind) {
  const res = await fetch(`${BASE}/${kind}/Sony%20-%20PlayStation.dat`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${kind} : ${res.status}`);
  const text = await res.text();
  const list = [];
  for (const block of text.split(/\ngame \(/).slice(1)) {
    if (!new RegExp(`\\b${kind} 1\\b`).test(block)) continue;
    for (const m of block.matchAll(/serial "([^"]+)"/g)) {
      for (const s of m[1].split(/,\s*/)) if (/^[A-Z]{4}-\d{5}$/.test(s.trim().toUpperCase())) list.push(s.trim().toUpperCase());
    }
  }
  return [...new Set(list)].sort();
}

const analog = await serials('analog');
const rumble = await serials('rumble');
console.log(`${analog.length} codes avec manette analogique, ${rumble.length} avec vibrations`);

const values = (list) => list.map((s) => `('${s}')`).join(', ');
const latest = readdirSync(join(ROOT, 'supabase', 'migrations')).map((n) => n.slice(0, 14)).sort().at(-1);
const now = new Date();
const clock = now.toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = clock > latest ? clock : String(BigInt(latest) + 100n);
writeFileSync(join(ROOT, 'supabase', 'migrations', `${stamp}_import_specs_libretro.sql`), `-- =====================================================================
-- Carte Mémoire · Manette analogique et vibrations, depuis libretro-database
-- Fichier GÉNÉRÉ par scripts/import-specs-libretro.mjs le ${now.toISOString().slice(0, 10)}.
-- Source : libretro-database, metadat/analog et metadat/rumble (CC BY-SA).
--
-- Listes partielles : seuls des « oui » sont ajoutés, par code produit, et
-- jamais par-dessus une valeur déjà saisie. « Compatible » pour l'analogique :
-- la source ne dit pas si la manette est requise.
-- =====================================================================

update public.release r
set specs = r.specs || '{"analog": "compatible"}'
from public.platform p
where p.id = r.platform_id and p.short_name = 'PS1'
  and r.product_code in (select s from (values ${values(analog)}) v(s))
  and not r.specs ? 'analog';

update public.release r
set specs = r.specs || '{"vibration": true}'
from public.platform p
where p.id = r.platform_id and p.short_name = 'PS1'
  and r.product_code in (select s from (values ${values(rumble)}) v(s))
  and not r.specs ? 'vibration';
`);
console.log(`Migration écrite : supabase/migrations/${stamp}_import_specs_libretro.sql`);
