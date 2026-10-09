// Vérifie les migrations sur une base PostgreSQL embarquée (PGlite), sans Docker ni compte Supabase :
// les migrations s'appliquent, les contraintes refusent les données invalides,
// et les règles de sécurité laissent passer (ou bloquent) les bonnes personnes.
// Usage : node check-migrations.mjs <dossier des migrations>
// (sera branché sur `npm test` à l'étape 4, quand le projet aura son package.json)
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2];
const db = new PGlite({ extensions: { unaccent, pg_trgm } });

// --- Imitation minimale de Supabase : rôles, jetons (JWT), double authentification,
// stockage de fichiers, schémas auth et extensions, droits par défaut
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_type text not null default 'totp', status text not null);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

for (const f of readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(dossier, f), 'utf8'));
    console.log(`migration OK  ${f}`);
  } catch (e) {
    console.log(`migration KO  ${f}\n  ${e.message}`);
    process.exit(1);
  }
}

let echecs = 0;
// Exécute une requête comme le ferait l'API Supabase pour cet utilisateur.
// aal = niveau d'authentification de la session : 'aal1' (mot de passe ou passkey)
// ou 'aal2' (double authentification validée). L'admin des tests est en aal2.
async function en(uid, sql, params = [], aal = uid === ADMIN ? 'aal2' : 'aal1') {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [uid ? JSON.stringify({ sub: uid, aal }) : '']);
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}
async function ok(label, p) {
  try { const r = await p; console.log(`  ✔ ${label}`); return r; }
  catch (e) { echecs++; console.log(`  ✘ ${label}\n      erreur inattendue : ${e.message}`); }
}
async function ko(label, p, attendu) {
  try { await p; echecs++; console.log(`  ✘ ${label}\n      aurait dû échouer`); }
  catch (e) {
    if (attendu && !e.message.includes(attendu)) { echecs++; console.log(`  ✘ ${label}\n      mauvaise erreur : ${e.message}`); }
    else console.log(`  ✔ ${label}  (refusé : ${e.message.split('\n')[0]})`);
  }
}
async function egal(label, p, attendu) {
  try {
    const r = await p; const v = JSON.stringify(r);
    if (v === JSON.stringify(attendu)) console.log(`  ✔ ${label}`);
    else { echecs++; console.log(`  ✘ ${label}\n      obtenu ${v}, attendu ${JSON.stringify(attendu)}`); }
  } catch (e) { echecs++; console.log(`  ✘ ${label}\n      erreur : ${e.message}`); }
}
const val = async (sql, params) => (await db.query(sql, params)).rows;
const lignes = (p) => p.then((r) => r.rows);

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const MEMBRE = '00000000-0000-0000-0000-00000000000b';
const AUTRE = '00000000-0000-0000-0000-00000000000c';

console.log('\nInscription et profils');
await ok('inscription avec pseudo', db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"Alexis"}')`, [ADMIN]));
await ok('inscription sans pseudo', db.query(`insert into auth.users (id) values ($1)`, [MEMBRE]));
await ok('inscription avec pseudo déjà pris (casse différente)', db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"alexis"}')`, [AUTRE]));
await egal('pseudos générés', val(`select username from public.profile order by id`), [{ username: 'Alexis' }, { username: 'player' }, { username: 'alexis_000000' }]);
await db.query(`update public.profile set role = 'admin' where id = $1`, [ADMIN]);

console.log('\nDonnées de référence');
await egal('PS1 présente avec ses 6 champs spécifiques', val(`select short_name, jsonb_array_length(spec_fields) as n from public.platform`), [{ short_name: 'PS1', n: 6 }]);
await egal('France rangée dans Europe, dans Monde', val(`select z.code as zone, w.code as world from public.region c join public.region z on z.id = c.parent_id join public.region w on w.id = z.parent_id where c.code = 'FR'`), [{ zone: 'europe', world: 'world' }]);
await egal('39 régions', val(`select count(*)::int as n from public.region`), [{ n: 39 }]);

console.log('\nVisiteur non connecté');
await ok('lit le catalogue', en(null, `select * from public.platform`));
await ko('ne peut pas ajouter un jeu', en(null, `insert into public.game (title) values ('Pirate')`), 'permission denied');
await ko('ne peut pas lire les propositions', en(null, `select * from public.submission`), 'permission denied');
await ko('ne peut pas appeler set_user_role', en(null, `select public.set_user_role($1, 'admin')`, [MEMBRE]), 'permission denied');

console.log('\nMembre');
await ko('ne peut pas ajouter un jeu directement', en(MEMBRE, `insert into public.game (title) values ('Pirate')`), 'row-level security');
await ko('ne peut pas se donner le rôle admin', en(MEMBRE, `update public.profile set role = 'admin' where id = $1`, [MEMBRE]), 'permission denied');
await ok('peut changer son pseudo', en(MEMBRE, `update public.profile set username = 'Membre_1' where id = $1`, [MEMBRE]));
await egal('ne peut pas changer le pseudo d\'un autre (0 ligne touchée)', lignes(en(MEMBRE, `update public.profile set username = 'pirate' where id = $1 returning id`, [ADMIN])), []);
await ko('ne peut pas utiliser set_user_role', en(MEMBRE, `select public.set_user_role($1, 'admin')`, [MEMBRE]), 'Only an admin');

console.log('\nAdmin : saisie de Final Fantasy VII');
const jeu = (await ok('ajoute le jeu', en(ADMIN, `insert into public.game (title) values ('Final Fantasy VII') returning id`))).rows[0].id;
const ps1 = (await val(`select id from public.platform where short_name = 'PS1'`))[0].id;
const ff7fr = (await ok('ajoute la sortie PAL FR', en(ADMIN, `
  insert into public.release (game_id, platform_id, local_title, product_code, zone, media_count, languages, specs)
  values ($1, $2, 'Final Fantasy VII', 'SCES-00868', 'PAL', 3, '{fr}', '{"memory_card_blocks": 1}') returning id`, [jeu, ps1]))).rows[0].id;
await ok('ajoute la version Platinum comme réédition', en(ADMIN, `
  insert into public.release (game_id, platform_id, reissue_of, local_title, product_code, zone, edition_type, edition_name, media_count, languages)
  values ($1, $2, $3, 'Final Fantasy VII', 'SCES-00868', 'PAL', 'reissue', 'Platinum', 3, '{fr}')`, [jeu, ps1, ff7fr]));
const autreJeu = (await en(ADMIN, `insert into public.game (title) values ('Crash Bandicoot') returning id`)).rows[0].id;
await ko('une réédition doit concerner le même jeu', en(ADMIN, `
  insert into public.release (game_id, platform_id, reissue_of, local_title) values ($1, $2, $3, 'Crash Bandicoot')`, [autreJeu, ps1, ff7fr]), 'foreign key');
await ok('date précise au mois (1997-11-01)', en(ADMIN, `
  insert into public.release_region (release_id, region_id, release_date, date_precision)
  select $1, id, '1997-11-01', 'month' from public.region where code = 'FR'`, [ff7fr]));
await ko('date « au mois » qui n\'est pas un 1er', en(ADMIN, `
  insert into public.release_region (release_id, region_id, release_date, date_precision)
  select $1, id, '1997-11-17', 'month' from public.region where code = 'BE'`, [ff7fr]), 'check');
await ko('date sans précision', en(ADMIN, `
  insert into public.release_region (release_id, region_id, release_date)
  select $1, id, '1997-11-17' from public.region where code = 'CH'`, [ff7fr]), 'check');
await ok('éditeur Sony pour la sortie PAL', en(ADMIN, `
  insert into public.release_company (release_id, company_id, role)
  select $1, id, 'publisher' from public.company where wikidata_id = 'Q18594'`, [ff7fr]));
await ko('langue mal formée', en(ADMIN, `insert into public.release (game_id, platform_id, local_title, languages) values ($1, $2, 'X', '{FR}')`, [jeu, ps1]), 'check');
await ko('code-barres avec des lettres', en(ADMIN, `insert into public.release (game_id, platform_id, local_title, barcode) values ($1, $2, 'X', 'ABC123456')`, [jeu, ps1]), 'check');
await egal('updated_at mis à jour automatiquement', lignes(en(ADMIN, `update public.game set summary = 'Cloud et compagnie' where id = $1 returning updated_at > created_at as maj`, [jeu])), [{ maj: true }]);

console.log('\nCollections');
await ok('membre ajoute FF7 à sa collection', en(MEMBRE, `insert into public.collection_item (release_id, condition, has_box, has_manual, has_media, purchase_price) values ($1, 'good', true, true, true, 15)`, [ff7fr]));
await ok('membre ajoute un double', en(MEMBRE, `insert into public.collection_item (release_id) values ($1)`, [ff7fr]));
await ko('membre ne peut pas remplir la collection d\'un autre', en(MEMBRE, `insert into public.collection_item (profile_id, release_id) values ($1, $2)`, [AUTRE, ff7fr]), 'row-level security');
await egal('collection privée : invisible pour les autres membres', lignes(en(AUTRE, `select count(*)::int as n from public.collection_item`)), [{ n: 0 }]);
await egal('collection privée : invisible pour les visiteurs', lignes(en(null, `select count(*)::int as n from public.collection_item`)), [{ n: 0 }]);
await ok('membre rend sa collection publique', en(MEMBRE, `update public.profile set public_collection = true where id = $1`, [MEMBRE]));
await egal('collection publique : visible par les visiteurs', lignes(en(null, `select count(*)::int as n from public.collection_item`)), [{ n: 2 }]);
await ko('une sortie possédée ne peut pas être supprimée', en(ADMIN, `delete from public.release where id = $1`, [ff7fr]), 'foreign key');

console.log('\nPropositions');
await ok('membre propose un jeu', en(MEMBRE, `insert into public.submission (action, target, data, sources) values ('create', 'game', '{"game": {"title": "Vagrant Story"}, "no_cover": true}', 'ma boîte')`));
await ko('membre ne peut pas s\'auto-valider', en(MEMBRE, `insert into public.submission (action, target, data, status) values ('create', 'game', '{}', 'approved')`), 'permission denied');
await ko('une modification doit viser un objet existant', en(MEMBRE, `insert into public.submission (action, target, data) values ('update', 'game', '{}')`), 'check');
await egal('l\'auteur et le statut sont remplis automatiquement', val(`select author_id, status from public.submission`), [{ author_id: MEMBRE, status: 'pending' }]);
await egal('un autre membre ne la voit pas', lignes(en(AUTRE, `select count(*)::int as n from public.submission`)), [{ n: 0 }]);
await egal('un admin la voit', lignes(en(ADMIN, `select count(*)::int as n from public.submission`)), [{ n: 1 }]);
await egal('l\'auteur peut la retirer', lignes(en(MEMBRE, `delete from public.submission returning id`)).then((r) => r.length), 1);

console.log('\nAudit de sécurité Supabase');
await ko('la fonction de déclencheur n\'est pas appelable par un visiteur', en(null, `select public.handle_new_user()`), 'permission denied');
await ko('…ni par un membre', en(MEMBRE, `select public.handle_new_user()`), 'permission denied');
await ko('is_moderator n\'est plus exposée dans l\'API (schéma privé)', en(null, `select public.is_moderator()`), 'does not exist');

console.log('\nDouble authentification (MFA)');
await ko('admin sans double authentification : catalogue refusé', en(ADMIN, `insert into public.genre (name) values ('Genre MFA')`, [], 'aal1'), 'row-level security');
await ko('admin sans double authentification : changement de rôle refusé', en(ADMIN, `select public.set_user_role($1, 'member')`, [MEMBRE], 'aal1'), 'two-factor');
await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [MEMBRE]);
await ko('MFA activée, session sans 2e facteur : ajout à la collection refusé', en(MEMBRE, `insert into public.collection_item (release_id) values ($1)`, [ff7fr]), 'row-level security');
await egal('…modification du profil sans effet (0 ligne)', lignes(en(MEMBRE, `update public.profile set avatar = 'x' where id = $1 returning id`, [MEMBRE])), []);
await ok('MFA activée, session validée (aal2) : ajout accepté', en(MEMBRE, `insert into public.collection_item (release_id) values ($1)`, [ff7fr], 'aal2'));
await db.query(`delete from auth.mfa_factors where user_id = $1`, [MEMBRE]);
await ok('sans MFA activée, une session simple suffit', en(MEMBRE, `update public.profile set avatar = null where id = $1`, [MEMBRE]));

console.log('\nImages');
const monImage = `${MEMBRE}/jaquette.webp`;
await ok('un membre dépose une image dans son dossier', en(MEMBRE, `insert into storage.objects (bucket_id, name) values ('submission-images', $1)`, [monImage]));
await ko('…mais pas dans le dossier d\'un autre', en(MEMBRE, `insert into storage.objects (bucket_id, name) values ('submission-images', $1)`, [`${AUTRE}/x.webp`]), 'row-level security');
await ko('un visiteur ne peut rien déposer', en(null, `insert into storage.objects (bucket_id, name) values ('submission-images', 'x/y.webp')`), 'row-level security');
await ko('un membre ne peut pas écrire dans les jaquettes publiques', en(MEMBRE, `insert into storage.objects (bucket_id, name) values ('covers', 'a.webp')`), 'row-level security');
await egal('un autre membre ne voit pas l\'image', lignes(en(AUTRE, `select count(*)::int as n from storage.objects where bucket_id = 'submission-images'`)), [{ n: 0 }]);
await egal('un admin la voit', lignes(en(ADMIN, `select count(*)::int as n from storage.objects where bucket_id = 'submission-images'`)), [{ n: 1 }]);

console.log('\nProposer un jeu ou une version');
const propose = (data, uid = MEMBRE, target = 'game') => en(uid, `insert into public.submission (action, target, data) values ('create', $2, $1::jsonb)`, [JSON.stringify(data), target]);
const nouveauJeu = { game: { title: 'Jeu Inconnu' }, release: { platform_id: Number(ps1), zone: 'PAL', local_title: 'Jeu Inconnu' } };
await ko('sans jaquette ni case cochée : refusé', propose(nouveauJeu), 'submission_cover_or_no_cover');
await ok('avec la case « pas de jaquette » : accepté', propose({ ...nouveauJeu, no_cover: true }));
await ko('avec une jaquette ET la case cochée : refusé', propose({ ...nouveauJeu, cover_path: monImage, no_cover: true }), 'submission_cover_or_no_cover');
await ko('avec une jaquette jamais envoyée : refusé', propose({ ...nouveauJeu, cover_path: `${MEMBRE}/fantome.webp` }), 'introuvable');
await ko('avec la jaquette d\'un autre (invisible pour lui) : refusé', propose({ ...nouveauJeu, cover_path: `${AUTRE}/x.webp` }), 'introuvable');
await ok('avec sa jaquette bien envoyée : accepté', propose({ ...nouveauJeu, cover_path: monImage }));
await ko('un jeu sans titre : refusé', propose({ game: { title: '  ' }, no_cover: true }), 'submission_new_game_has_title');
await ok('une nouvelle version d\'un jeu existant', propose({ game_id: Number(jeu), release: { zone: 'NTSC-J', local_title: 'FF7 JP' }, no_cover: true }, MEMBRE, 'release'));
await ko('…sans préciser le jeu : refusé', propose({ release: { zone: 'NTSC-J' }, no_cover: true }, MEMBRE, 'release'), 'submission_new_release_has_game');

console.log('\nRecherche');
const cherche = (q) => lignes(en(null, `select title, matched_title from public.search_games($1)`, [q]));
await egal('un visiteur peut chercher ; le titre exact sort en premier', cherche('final fantasy VII').then((r) => r[0].title), 'Final Fantasy VII');
await egal('accents et ponctuation ignorés', cherche('FINAL-FANTASY  vii!').then((r) => r[0].title), 'Final Fantasy VII');
await egal('un titre régional trouve le jeu (« Bio Hazard » → Resident Evil)', cherche('bio hazard').then((r) => r.some((x) => x.title === 'Resident Evil' && x.matched_title === 'Bio Hazard')), true);
await egal('un titre français trouve le jeu (« Dream Story » → 40 Winks)', cherche('dream story').then((r) => r.some((x) => x.title === '40 Winks')), true);
await egal('une recherche trop courte ne renvoie rien', cherche('a').then((r) => r.length), 0);
await egal('au plus 20 résultats par défaut', cherche('the').then((r) => r.length), 20);

console.log('\nRôles');
await ko('un membre ne peut pas modifier le catalogue avant d\'être nommé', en(AUTRE, `insert into public.genre (name) values ('Genre de test')`), 'row-level security');
await ko('admin sans double authentification ne peut pas nommer', en(ADMIN, `select public.set_user_role($1, 'moderator')`, [AUTRE], 'aal1'), 'two-factor');
await ok('admin nomme un modérateur', en(ADMIN, `select public.set_user_role($1, 'moderator')`, [AUTRE]));
await ko('le nouveau modérateur, sans double authentification, est refusé', en(AUTRE, `insert into public.genre (name) values ('Genre de test')`), 'row-level security');
await ok('le nouveau modérateur, en double authentification, peut ajouter un genre', en(AUTRE, `insert into public.genre (name) values ('Genre de test')`, [], 'aal2'));

console.log('\nDétection des doublons');
await egal('casse, espaces et ponctuation ignorés', val(`select public.normalize_name('FINAL  fantasy: VII!') = public.normalize_name('Final Fantasy VII') as same`), [{ same: true }]);
await egal('accents ignorés', val(`select public.normalize_name('Pokémon Snap') as k`), [{ k: 'pokemonsnap' }]);
await egal('un titre japonais garde une clé', val(`select public.normalize_name('ファイナルファンタジーVII') is not null as ok`), [{ ok: true }]);
await egal('la clé est calculée automatiquement', lignes(en(ADMIN, `insert into public.game (title) values ('Jeu de Test Mémoire') returning title_key`)), [{ title_key: 'jeudetestmemoire' }]);
await ok('un même titre reste possible (homonymes)', en(ADMIN, `insert into public.game (title) values ('JEU DE TEST : MÉMOIRE')`));
await egal('…et apparaît dans les doublons possibles', lignes(en(ADMIN, `select total from public.possible_duplicate_game where title_key = 'jeudetestmemoire'`)), [{ total: 2 }]);
await ko('les doublons possibles ne sont pas visibles des visiteurs', en(null, `select * from public.possible_duplicate_game`), 'permission denied');
await egal('les symboles (~ + $ = …) sont ignorés quel que soit le serveur', val(`select public.normalize_name('Xevious 3D/G+') = public.normalize_name('Xevious 3D/G') and public.normalize_name('Noël ~La Neige~') = 'noellaneige' as same`), [{ same: true }]);

console.log('\nFusion de deux fiches');
const garde = (await en(ADMIN, `insert into public.game (title, wikidata_id) values ('Jeu Fusion', 'Q999999991') returning id`)).rows[0].id;
const doublon = (await en(ADMIN, `insert into public.game (title, first_release_date, first_release_precision) values ('JEU FUSION !', '1998-01-01', 'year') returning id`)).rows[0].id;
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title) values ($1, $2, 'Jeu Fusion')`, [garde, ps1]);
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Jeu Fusion', 'PAL'), ($1, $2, 'Jeu Fusion JP', 'NTSC-J')`, [doublon, ps1]);
await ko('un membre ne peut pas fusionner', en(MEMBRE, `select public.merge_games($1, $2)`, [garde, doublon]), 'Seuls les modérateurs');
await ko('un visiteur ne peut pas fusionner', en(null, `select public.merge_games($1, $2)`, [garde, doublon]), 'permission denied');
await ok('un admin fusionne les deux fiches', en(ADMIN, `select public.merge_games($1, $2)`, [garde, doublon]));
await egal('le doublon a disparu', val(`select count(*)::int as n from public.game where id = $1`, [doublon]), [{ n: 0 }]);
await egal('ses sorties sont passées sur le jeu conservé, la sortie « à compléter » est retirée', val(`select string_agg(zone::text, ',' order by zone) as zones from public.release where game_id = $1`, [garde]), [{ zones: 'NTSC-J,PAL' }]);
await egal('la date manquante est récupérée', val(`select extract(year from first_release_date)::int as an from public.game where id = $1`, [garde]), [{ an: 1998 }]);
const autreQid = (await en(ADMIN, `insert into public.game (title, wikidata_id) values ('Jeu Fusion', 'Q999999992') returning id`)).rows[0].id;
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title) values ($1, $2, 'Jeu Fusion')`, [autreQid, ps1]);
await ko('deux identifiants Wikidata différents : fusion refusée', en(ADMIN, `select public.merge_games($1, $2)`, [garde, autreQid]), 'identifiants Wikidata différents');

console.log('\nCohérence du catalogue (imports compris)');
await egal('chaque jeu importé a au moins une sortie', val(`select count(*)::int as n from public.game g where g.wikidata_id is not null and not exists (select 1 from public.release r where r.game_id = g.id)`), [{ n: 0 }]);
await egal('chaque date de sortie est cohérente avec sa précision', val(`select count(*)::int as n from public.release_region where (release_date is null) <> (date_precision is null)`), [{ n: 0 }]);
await egal('aucune réédition vers un autre jeu', val(`select count(*)::int as n from public.release r join public.release o on o.id = r.reissue_of where o.game_id <> r.game_id`), [{ n: 0 }]);

console.log(echecs ? `\n${echecs} test(s) en échec` : '\nTous les tests passent');
process.exit(echecs ? 1 : 0);
