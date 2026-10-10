// Vérifie les migrations sur une base PostgreSQL embarquée (PGlite), sans Docker ni compte Supabase :
// les migrations s'appliquent, les contraintes refusent les données invalides,
// et les règles de sécurité laissent passer (ou bloquent) les bonnes personnes.
// Usage : node check-migrations.mjs <dossier des migrations>
// Ou simplement, depuis ce dossier : npm test
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
await egal('PS1 présente avec ses 6 champs spécifiques', val(`select short_name, jsonb_array_length(spec_fields) as n from public.platform where short_name = 'PS1'`), [{ short_name: 'PS1', n: 6 }]);
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
  values ($1, $2, 'Final Fantasy VII', 'SCES-99868', 'PAL', 3, '{fr}', '{"memory_card_blocks": 1}') returning id`, [jeu, ps1]))).rows[0].id;
await ok('ajoute la version Platinum comme réédition', en(ADMIN, `
  insert into public.release (game_id, platform_id, reissue_of, local_title, product_code, zone, edition_type, edition_name, media_count, languages)
  values ($1, $2, $3, 'Final Fantasy VII', 'SCES-99868', 'PAL', 'reissue', 'Platinum', 3, '{fr}')`, [jeu, ps1, ff7fr]));
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

console.log('\nModération');
const soumettre = async (data, target = 'game') => (await en(MEMBRE, `insert into public.submission (action, target, data, sources) values ('create', $2, $1::jsonb, 'test') returning id`, [JSON.stringify(data), target])).rows[0].id;
const traiter = (uid, id, approve, note = null, cover = null, attach = null, aal) => en(uid, `select public.review_submission($1, $2, $3, $4, $5) as r`, [id, approve, note, cover, attach], aal);
const versionPAL = { platform_id: Number(ps1), zone: 'PAL', local_title: 'Mon Jeu Perdu', product_code: 'sles-01234', edition_type: 'standard', languages: ['fr', 'en'], region_code: 'FR', release_date: '1999-03-01', date_precision: 'month', publisher_name: 'Éditeur Inconnu', developer_name: 'Studio Fantôme' };

const p1 = await soumettre({ game: { title: 'Mon Jeu Perdu' }, release: versionPAL, no_cover: true });
await ko('un membre ne peut pas traiter une proposition', traiter(MEMBRE, p1, true), 'Seuls les modérateurs');
await ko('un visiteur non plus', en(null, `select public.review_submission($1, true)`, [p1]), 'permission denied');
await ko('un admin sans double authentification non plus', traiter(ADMIN, p1, true, null, null, null, 'aal1'), 'Seuls les modérateurs');
const r1 = await ok('un admin accepte un nouveau jeu', traiter(ADMIN, p1, true));
const cree = r1.rows[0].r;
await egal('le jeu est créé avec sa première sortie', val(`select title, first_release_date::text as d, first_release_precision as p from public.game where id = $1`, [cree.game_id]), [{ title: 'Mon Jeu Perdu', d: '1999-03-01', p: 'month' }]);
await egal('la version est créée (code produit en majuscules)', val(`select zone, local_title, product_code, languages from public.release where id = $1`, [cree.release_id]), [{ zone: 'PAL', local_title: 'Mon Jeu Perdu', product_code: 'SLES-01234', languages: ['fr', 'en'] }]);
await egal('…avec sa date en France', val(`select rg.code, rr.release_date::text as d from public.release_region rr join public.region rg on rg.id = rr.region_id where rr.release_id = $1`, [cree.release_id]), [{ code: 'FR', d: '1999-03-01' }]);
await egal('…son éditeur et son développeur (sociétés créées)', val(`select (select c.name from public.release_company rc join public.company c on c.id = rc.company_id where rc.release_id = $1) as editeur, (select c.name from public.game_developer gd join public.company c on c.id = gd.company_id where gd.game_id = $2) as dev`, [cree.release_id, cree.game_id]), [{ editeur: 'Éditeur Inconnu', dev: 'Studio Fantôme' }]);
await egal('l\'auteur voit sa proposition acceptée et le jeu créé', lignes(en(MEMBRE, `select status, created_game_id from public.submission where id = $1`, [p1])), [{ status: 'approved', created_game_id: cree.game_id }]);
await ko('une proposition déjà traitée ne peut pas l\'être deux fois', traiter(ADMIN, p1, false, 'non'), 'déjà été traitée');

const p2 = await soumettre({ game: { title: 'Doublon Volontaire' }, release: { ...versionPAL, publisher_name: 'Éditeur Inconnu' }, no_cover: true });
await ko('refuser sans motif : impossible', traiter(ADMIN, p2, false), 'motif');
await ok('refuser avec un motif', traiter(ADMIN, p2, false, 'Ce jeu existe déjà'));
await egal('l\'auteur voit le refus et son motif', lignes(en(MEMBRE, `select status, review_note from public.submission where id = $1`, [p2])), [{ status: 'rejected', review_note: 'Ce jeu existe déjà' }]);

const p3 = await soumettre({ game: { title: 'Mon Jeu Perdu (titre US)' }, release: { ...versionPAL, zone: 'NTSC-U', region_code: 'US', local_title: 'My Lost Game' }, no_cover: true });
const r3 = (await ok('rattacher un « nouveau jeu » à un jeu existant', traiter(ADMIN, p3, true, null, null, cree.game_id))).rows[0].r;
await egal('…aucun jeu en plus, une version en plus', val(`select count(*)::int as n from public.release where game_id = $1`, [cree.game_id]), [{ n: 2 }]);
await egal('…le même éditeur est réutilisé (pas de doublon de société)', val(`select count(*)::int as n from public.company where name_key = public.normalize_name('Éditeur Inconnu')`), [{ n: 1 }]);

const p4 = await soumettre({ game_id: cree.game_id, release: { ...versionPAL, edition_type: 'reissue', edition_name: 'Platinum', region_code: '' }, cover_path: monImage }, 'release');
await ko('accepter sans avoir copié la jaquette : refusé', traiter(ADMIN, p4, true), 'copiée');
await ok('le modérateur copie la jaquette dans les jaquettes publiques', en(ADMIN, `insert into storage.objects (bucket_id, name) values ('covers', 'submissions/test.webp')`));
const r4 = (await ok('…puis accepte la nouvelle version', traiter(ADMIN, p4, true, null, 'submissions/test.webp'))).rows[0].r;
await egal('la jaquette est rattachée à la version (recto)', val(`select type, path from public.image where release_id = $1`, [r4.release_id]), [{ type: 'front', path: 'submissions/test.webp' }]);
await egal('…et sort dans la recherche', lignes(en(null, `select cover_path from public.search_games('mon jeu perdu') where id = $1`, [cree.game_id])), [{ cover_path: 'submissions/test.webp' }]);
await ko('des données trop volumineuses sont refusées', en(MEMBRE, `insert into public.submission (action, target, data) values ('create', 'game', $1::jsonb)`, [JSON.stringify({ game: { title: 'x'.repeat(40000) }, no_cover: true })]), 'submission_data_size');

console.log('\nConsoles');
await egal('32 consoles déclarées', val(`select count(*)::int as n from public.platform`), [{ n: 32 }]);
await egal('chaque console a son constructeur et son identifiant Wikidata', val(`select count(*)::int as n from public.platform where manufacturer_id is null or wikidata_id is null`), [{ n: 0 }]);
await egal('pas de constructeur en double', val(`select count(*)::int as n from public.possible_duplicate_company where name_key in ('nintendo', 'sega', 'microsoft', 'nec')`), [{ n: 0 }]);
const consoles = await lignes(en(null, `select short_name, manufacturer, game_count from public.list_platforms()`));
await egal('la liste des consoles est publique, avec le nombre de jeux', consoles.find((c) => c.short_name === 'PS1').game_count > 4000 && consoles.find((c) => c.short_name === 'NES').game_count === 0, true);
await egal('…rangée par constructeur', consoles.find((c) => c.short_name === 'NSW2').manufacturer, 'Nintendo');
const filtre = (q, c) => lignes(en(null, `select title from public.search_games($1, 20, $2)`, [q, c]));
await egal('recherche limitée à la PS1 : FF7 trouvé', filtre('final fantasy vii', 'PS1').then((r) => r[0]?.title), 'Final Fantasy VII');
await egal('recherche limitée à la NES : aucun jeu pour l\'instant', filtre('final fantasy', 'NES').then((r) => r.length), 0);
await egal('console inconnue : aucun résultat', filtre('final fantasy', 'ZZZ').then((r) => r.length), 0);
await egal('sans console : toutes', filtre('final fantasy vii', null).then((r) => r.length > 0), true);

console.log('\nDoublons : fusion forcée et faux positifs');
const gA = (await en(ADMIN, `insert into public.game (title, wikidata_id) values ('Jeu Doublon Wikidata', 'Q999999993') returning id`)).rows[0].id;
const gB = (await en(ADMIN, `insert into public.game (title, wikidata_id) values ('JEU DOUBLON WIKIDATA', 'Q999999994') returning id`)).rows[0].id;
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'A', 'PAL'), ($3, $2, 'B', 'NTSC-J')`, [gA, ps1, gB]);
await ko('identifiants Wikidata différents : refus sans « force »', en(ADMIN, `select public.merge_games($1, $2)`, [gA, gB]), 'identifiants Wikidata différents');
await ok('avec « force » : fusion acceptée', en(ADMIN, `select public.merge_games($1, $2, true)`, [gA, gB]));
await egal('la fiche gardée a ses deux versions et garde son identifiant', val(`select g.wikidata_id, (select count(*)::int from public.release r where r.game_id = g.id) as n from public.game g where g.id = $1`, [gA]), [{ wikidata_id: 'Q999999993', n: 2 }]);
const gC = (await en(ADMIN, `insert into public.game (title) values ('Homonyme Volontaire') returning id`)).rows[0].id;
const gD = (await en(ADMIN, `insert into public.game (title) values ('Homonyme volontaire !') returning id`)).rows[0].id;
await egal('deux homonymes apparaissent dans les doublons possibles', lignes(en(ADMIN, `select total from public.possible_duplicate_game where title_key = 'homonymevolontaire'`)), [{ total: 2 }]);
await ko('un membre ne peut pas les marquer « pas des doublons »', en(MEMBRE, `insert into public.dismissed_duplicate (title_key, game_ids) values ('homonymevolontaire', $1)`, [[gC, gD]]), 'row-level security');
await ok('un admin les marque « pas des doublons »', en(ADMIN, `insert into public.dismissed_duplicate (title_key, game_ids) values ('homonymevolontaire', $1)`, [[gC, gD]]));
await egal('…ils disparaissent de la liste', lignes(en(ADMIN, `select count(*)::int as n from public.possible_duplicate_game where title_key = 'homonymevolontaire'`)), [{ n: 0 }]);
await en(ADMIN, `insert into public.game (title) values ('HOMONYME-VOLONTAIRE') returning id`);
await egal('…mais reviennent si un troisième jeu du même nom arrive', lignes(en(ADMIN, `select total from public.possible_duplicate_game where title_key = 'homonymevolontaire'`)), [{ total: 3 }]);

console.log('\nRésumés');
await ok('un résumé Wikipédia avec son lien', en(ADMIN, `update public.game set summary = 'Un RPG culte.', summary_source = 'https://fr.wikipedia.org/wiki/Final_Fantasy_VII' where id = $1`, [jeu]));
await ko('une source qui n\'est pas Wikipédia en français : refusée', en(ADMIN, `update public.game set summary_source = 'https://exemple.com/' where id = $1`, [jeu]), 'game_summary_source_check');
await ko('une source sans résumé : refusée', en(ADMIN, `update public.game set summary = null where id = $1`, [jeu]), 'game_summary_source_needs_summary');
await ko('un résumé proposé trop court : refusé', en(MEMBRE, `insert into public.submission (action, target, target_id, data) values ('update', 'game', $1, '{"summary": "Trop court"}')`, [jeu]), 'submission_summary_text');
const texte = 'Cloud Strife, ancien membre du SOLDAT, rejoint le groupe AVALANCHE pour sauver la planète.';
const pr = (await ok('un membre propose un résumé', en(MEMBRE, `insert into public.submission (action, target, target_id, data, sources) values ('update', 'game', $1, $2::jsonb, 'j''ai fini le jeu') returning id`, [jeu, JSON.stringify({ summary: texte })]))).rows[0].id;
await ko('un membre ne peut pas l\'accepter lui-même', en(MEMBRE, `select public.review_submission($1, true)`, [pr]), 'Seuls les modérateurs');
await ok('un admin accepte le résumé', en(ADMIN, `select public.review_submission($1, true)`, [pr]));
await egal('le résumé de la communauté remplace celui de Wikipédia (plus de lien source)', val(`select summary, summary_source from public.game where id = $1`, [jeu]), [{ summary: texte, summary_source: null }]);
await egal('l\'auteur voit sa proposition acceptée, liée au jeu', lignes(en(MEMBRE, `select status, created_game_id from public.submission where id = $1`, [pr])), [{ status: 'approved', created_game_id: jeu }]);

console.log('\nRecherche par code produit');
const parCode = (q) => lignes(en(null, `select title, matched_code from public.search_games($1)`, [q]));
await egal('le code exact trouve le jeu, en premier', parCode('SCES-99868').then((r) => r[0]), { title: 'Final Fantasy VII', matched_code: 'SCES-99868' });
await egal('sans tiret ni majuscules', parCode('sces99868').then((r) => r[0]?.matched_code), 'SCES-99868');
await egal('avec une espace', parCode('SCES 99868').then((r) => r[0]?.matched_code), 'SCES-99868');
await egal('le début du code suffit', parCode('SCES-9986').then((r) => r.some((x) => x.matched_code === 'SCES-99868')), true);
await egal('les chiffres seuls aussi', parCode('99868').then((r) => r.some((x) => x.matched_code === 'SCES-99868')), true);
await egal('un titre sans chiffre ne cherche pas dans les codes', parCode('sces').then((r) => r.every((x) => x.matched_code === null)), true);
await egal('une recherche par titre reste inchangée', parCode('final fantasy VII').then((r) => r[0].title), 'Final Fantasy VII');

console.log('\nCatalogue à cocher et progression');
await egal('Action-RPG compte en RPG et en Action, Tactical RPG en RPG et en Stratégie', val(`select name, array_to_string(families, ',') as f from public.genre where name in ('RPG', 'Tactical RPG', 'Action-RPG') order by name`),
  [{ name: 'Action-RPG', f: 'rpg,action' }, { name: 'RPG', f: 'rpg' }, { name: 'Tactical RPG', f: 'rpg,strategy' }]);
await egal('un thème (science-fiction) n\'a pas de famille', val(`select cardinality(families) as n from public.genre where name = 'Jeu de science-fiction'`), [{ n: 0 }]);

// Genres d'un jeu importé, par son identifiant Wikidata
const genresDe = (qid) => val(`select string_agg(ge.name, ', ' order by ge.name) as g from public.game g join public.game_genre gg on gg.game_id = g.id join public.genre ge on ge.id = gg.genre_id where g.wikidata_id = $1`, [qid]).then((r) => r[0].g);
await egal('Wikipédia : Tintin: Destination Adventure n\'est plus un RPG', genresDe('Q3024607'), "Jeu d'aventure");
await egal('Wikipédia : Dragon Valor, Action-RPG et plates-formes', genresDe('Q3715070'), 'Action-RPG, Jeu de plates-formes');
await egal('Wikipédia dit « Sport » : WWF SmackDown! garde « Jeu de catch », plus précis', genresDe('Q2655866').then((g) => g?.includes('Jeu de catch') && g.includes('Jeu de sport')), true);
await egal('les thèmes (science-fiction, Noël…) restent en place',
  val(`select count(*)::int as n from public.game_genre gg join public.genre ge on ge.id = gg.genre_id where cardinality(ge.families) = 0`).then((r) => r[0].n > 200), true);
await egal('genres_reviewed : faux par défaut', val(`select bool_or(genres_reviewed) as r from public.game`), [{ r: false }]);
await ko('un membre ne peut pas changer les genres d\'un jeu', en(MEMBRE, `insert into public.game_genre (game_id, genre_id) values ($1, (select id from public.genre where name = 'RPG'))`, [autreJeu]), 'row-level security');
await ok('un modérateur (admin en double authentification) le peut', en(ADMIN, `insert into public.game_genre (game_id, genre_id) values ($1, (select id from public.genre where name = 'Jeu de stratégie'))`, [autreJeu]));
await ok('…et marque le jeu comme revu', en(ADMIN, `update public.game set genres_reviewed = true where id = $1`, [autreJeu]));
const catalogue = (uid, a = {}) => lignes(en(uid, `
  select * from public.catalog_games(platform_code => $1, zone_code => $2, first_letter => $3, family_code => $4, release_year => $5,
                                     ownership => $6, search => $7, sort_by => $8, page_number => $9, page_size => $10)`,
  [a.console === undefined ? 'PS1' : a.console, a.zone ?? null, a.letter ?? null, a.family ?? null, a.year ?? null,
   a.ownership ?? null, a.search ?? null, a.sort ?? 'title', a.page ?? 1, a.size ?? 50]));
const ff7 = (rows) => rows.find((r) => r.id === jeu);
const sansAccent = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const totalPal = (await val(`select count(distinct game_id)::int as n from public.release where zone = 'PAL' and platform_id = $1`, [ps1]))[0].n;

const vu = ff7(await catalogue(MEMBRE, { zone: 'PAL', search: 'final fantasy vii' }));
await egal('le membre voit son FF7 PAL possédé', Promise.resolve(vu && { owned: vu.owned, versions: vu.releases.length }), { owned: true, versions: 2 });
await egal('…la version Black Label d\'abord, avec ses 3 exemplaires ; la Platinum non cochée',
  Promise.resolve(vu?.releases.map((r) => ({ edition: r.edition_name ?? r.edition_type, owned: r.owned, copies: r.copies }))),
  [{ edition: 'standard', owned: true, copies: 3 }, { edition: 'Platinum', owned: false, copies: 0 }]);
await egal('un visiteur voit le jeu, sans rien de coché', catalogue(null, { zone: 'PAL', search: 'final fantasy vii' }).then((r) => ff7(r)?.owned), false);
await egal('la collection publique d\'un autre ne compte jamais comme la sienne', catalogue(AUTRE, { zone: 'PAL', search: 'final fantasy vii' }).then((r) => ff7(r)?.owned), false);
await egal('filtre « possédés » : seulement FF7', catalogue(MEMBRE, { zone: 'PAL', ownership: 'owned' }).then((r) => r.map((x) => x.id)), [jeu]);
await egal('filtre « manquants » : tout le reste du catalogue PAL', catalogue(MEMBRE, { zone: 'PAL', ownership: 'missing', size: 1 }).then((r) => r[0].total_count), totalPal - 1);
await egal('sans filtre : un jeu par ligne, autant que de jeux PAL', catalogue(MEMBRE, { zone: 'PAL', size: 1 }).then((r) => r[0].total_count), totalPal);
await egal('lettre F : uniquement des titres en F', catalogue(null, { zone: 'PAL', letter: 'f' }).then((r) => r.length > 0 && r.every((x) => sansAccent(x.display_title).startsWith('f'))), true);
await egal('lettre # : uniquement des titres qui commencent par un chiffre', catalogue(null, { zone: 'PAL', letter: '#' }).then((r) => r.length > 0 && r.every((x) => /^[0-9]/.test(sansAccent(x.display_title)))), true);
await egal('zone Japon : le titre japonais est affiché (Biohazard)', catalogue(null, { zone: 'NTSC-J', search: 'resident evil' }).then((r) => r.some((x) => x.title === 'Resident Evil' && x.display_title !== x.title)), true);
const page1 = await catalogue(null, { zone: 'PAL', size: 10 });
const page2 = await catalogue(null, { zone: 'PAL', size: 10, page: 2 });
await egal('pages de 10, sans chevauchement', Promise.resolve([page1.length, page2.length, page2.some((x) => page1.some((y) => y.id === x.id))]), [10, 10, false]);
await egal('tri par titre', Promise.resolve(page1.map((x) => sansAccent(x.display_title)).every((t, i, a) => i === 0 || a[i - 1] <= t)), true);
await egal('année 1997 : uniquement des jeux sortis en 1997', catalogue(null, { zone: 'PAL', year: 1997 }).then((r) => r.length > 0 && r.every((x) => String(x.release_date).includes('1997') || new Date(x.release_date).getUTCFullYear() === 1997)), true);
await egal('tri par date : du plus ancien au plus récent', catalogue(null, { zone: 'PAL', sort: 'date', size: 100 }).then((r) => r.filter((x) => x.release_date).every((x, i, a) => i === 0 || new Date(a[i - 1].release_date) <= new Date(x.release_date))), true);
await egal('console inconnue : aucun jeu', catalogue(null, { console: 'XYZ' }).then((r) => r.length), 0);
await egal('recherche par code produit dans le catalogue', catalogue(null, { zone: 'PAL', search: 'SCES-99868' }).then((r) => r.some((x) => x.id === jeu)), true);
const rpg = (await val(`select id from public.genre where name = 'Tactical RPG'`))[0].id;
await ok('FF7 de test classé en Tactical RPG', en(ADMIN, `insert into public.game_genre (game_id, genre_id) values ($1, $2)`, [jeu, rpg]));
await egal('famille RPG : le Tactical RPG y figure', catalogue(MEMBRE, { zone: 'PAL', family: 'rpg', ownership: 'owned' }).then((r) => r.map((x) => x.id)), [jeu]);
const unAutrePal = (await val(`select id, game_id from public.release where zone = 'PAL' and game_id <> $1 order by id limit 1`, [jeu]))[0];
await ok('le membre cherche un autre jeu PAL', en(MEMBRE, `insert into public.collection_item (release_id, status) values ($1, 'wanted')`, [unAutrePal.id]));
await egal('filtre « recherchés »', catalogue(MEMBRE, { zone: 'PAL', ownership: 'wanted' }).then((r) => r.map((x) => x.id)), [unAutrePal.game_id]);

const progression = (uid, zone = null) => lignes(en(uid, `select scope, code, total, owned, wanted from public.collection_progress('PS1', $1)`, [zone]))
  .then((rows) => Object.fromEntries(rows.map((r) => [`${r.scope}:${r.code}`, [r.total, r.owned, r.wanted]])));
const prog = await progression(MEMBRE, 'PAL');
await egal('progression PAL : 1 jeu possédé (3 exemplaires = 1 jeu), 1 recherché', Promise.resolve(prog['zone:PAL']), [totalPal, 1, 1]);
await egal('progression RPG (zone PAL) : 1 possédé', Promise.resolve(prog['family:rpg']?.[1]), 1);
await egal('…et Stratégie aussi : un Tactical RPG compte dans ses deux familles', Promise.resolve(prog['family:strategy']?.[1]), 1);
await egal('progression : les jeux classés par famille sont comptés', Promise.resolve(prog['family:known']?.[0] > 0), true);
await egal('un autre membre : rien de possédé', progression(AUTRE, 'PAL').then((p) => [p['zone:PAL'][1], p['zone:all'][1]]), [0, 0]);
await egal('un visiteur : la progression se calcule, à zéro', progression(null).then((p) => p['zone:all'][1]), 0);

console.log('\nGenres déduits du titre et file des jeux sans genre');
const genresDuTitre = (title) => val(`select string_agg(ge.name, ', ' order by ge.name) as g from public.game g join public.game_genre gg on gg.game_id = g.id join public.genre ge on ge.id = gg.genre_id where g.title = $1`, [title]).then((r) => r[0].g);
await egal('nouveau genre « Pachinko et pachislot », famille Société', val(`select array_to_string(families, ',') as f from public.genre where name = 'Pachinko et pachislot'`), [{ f: 'party' }]);
await egal('Hissatsu Pachi-Slot Station : pachinko et pachislot', genresDuTitre('Hissatsu Pachi-Slot Station'), 'Pachinko et pachislot');
await egal('Minna no Shogi: Jokyuuhen : shogi', genresDuTitre('Minna no Shogi: Jokyuuhen'), 'Shogi video game');
await egal('Cross Romance: Koi to Mahjong to Hanafuda to : mahjong ET cartes', genresDuTitre('Cross Romance: Koi to Mahjong to Hanafuda to'), 'Jeu de cartes, Jeu de mah-jong');
await egal('cas ambigu écarté : Tennis no Oujisama: Sweat & Tears reste sans genre', genresDuTitre('Tennis no Oujisama: Sweat & Tears'), null);
const file = (q, uid = MEMBRE) => lignes(en(uid, `select title, total_count from public.games_without_genre('PS1', null, $1, 1, 100)`, [q]));
await egal('file des jeux sans genre : le cas ambigu y est', file('tennis no oujisama').then((r) => r.map((x) => x.title)), ['Tennis no Oujisama: Sweat & Tears']);
await egal('…mais plus les jeux classés par leur titre', file('hissatsu pachi').then((r) => r.length), 0);
await ko('un visiteur ne peut pas lire la file', file('a', null), 'permission denied');

console.log('\nDétails d\'un exemplaire');
await ok('acheté d\'occasion en brocante, reblisté, avec spine card, à échanger', en(MEMBRE, `
  insert into public.collection_item (release_id, condition, acquisition, purchase_place, has_spine_card, trade_status)
  values ($1, 'resealed', 'used', 'Brocante de Lyon', true, 'for_trade')`, [ff7fr]));
await egal('les états restent dans l\'ordre : blister d\'origine, reblisté, comme neuf, puis les autres',
  val(`select array_to_string(enum_range(null::public.item_condition), ',') as e`), [{ e: 'sealed,resealed,like_new,very_good,good,fair,poor' }]);
await ko('un jeu recherché ne peut pas être « à vendre »', en(MEMBRE, `insert into public.collection_item (release_id, status, trade_status) values ($1, 'wanted', 'for_sale')`, [ff7fr]), 'collection_item_owned_details');
await ko('…ni avoir de lieu d\'achat', en(MEMBRE, `insert into public.collection_item (release_id, status, purchase_place) values ($1, 'wanted', 'eBay')`, [ff7fr]), 'collection_item_owned_details');
await ko('lieu d\'achat trop long', en(MEMBRE, `insert into public.collection_item (release_id, purchase_place) values ($1, $2)`, [ff7fr, 'x'.repeat(81)]), 'check');
await ko('lieu d\'achat vide', en(MEMBRE, `insert into public.collection_item (release_id, purchase_place) values ($1, '  ')`, [ff7fr]), 'check');

console.log('\nImport d\'une collection (CSV)');
const platinumFf7 = (await val(`select id from public.release where reissue_of = $1`, [ff7fr]))[0].id;
const retrouve = (rows, uid = MEMBRE) => lignes(en(uid, `select row_index, release_id, method, needs_review, jsonb_array_length(choices) as n from public.match_import_rows($1::jsonb)`, [JSON.stringify(rows)]));
await egal('par code produit, sans édition : Black Label proposée, mais à vérifier (la Platinum a le même code)',
  retrouve([{ code: 'sces 99868' }]), [{ row_index: 0, release_id: ff7fr, method: 'code', needs_review: true, n: 2 }]);
await egal('code + « Platinum » : la Platinum en premier choix, sans doute possible', retrouve([{ code: 'SCES-99868', edition: 'Platinum' }]),
  [{ row_index: 0, release_id: platinumFf7, method: 'code', needs_review: false, n: 2 }]);
await egal('code + « Black Label » : l\'édition normale, sans doute possible', retrouve([{ code: 'SCES-99868', edition: 'Black Label' }]).then((r) => [r[0].release_id, r[0].needs_review]),
  [ff7fr, false]);
await egal('code + mauvaise zone : à vérifier', retrouve([{ code: 'SCES-99868', zone: 'NTSC-U', edition: 'Black Label' }]).then((r) => r[0].needs_review), true);
await egal('par identifiant (fichier exporté par le site)', retrouve([{ release_id: String(platinumFf7), code: 'n\'importe quoi' }]),
  [{ row_index: 0, release_id: platinumFf7, method: 'id', needs_review: false, n: 1 }]);
await egal('par titre et zone : la version japonaise', retrouve([{ title: 'CRASH bandicoot', zone: 'NTSC-J' }]).then(async (r) => [r[0].method, (await val(`select zone from public.release where id = $1`, [r[0].release_id]))[0].zone]),
  ['title', 'NTSC-J']);
await egal('une ligne introuvable n\'apparaît pas, les autres gardent leur numéro', retrouve([{ title: 'Jeu qui n\'existe pas du tout' }, { code: 'SCES-99868', edition: 'Platinum' }]).then((r) => r.map((x) => x.row_index)), [1]);
await ko('plus de 2 000 lignes : refusé', retrouve(Array.from({ length: 2001 }, () => ({ code: 'SCES-99868' }))), '2 000 lignes');
await ko('un visiteur ne peut pas l\'utiliser', retrouve([{ code: 'SCES-99868' }], null), 'permission denied');

console.log('\nSuppression d\'un jeu ou d\'une version');
await ko('un membre ne peut pas supprimer un jeu', en(MEMBRE, `select public.delete_game($1)`, [jeu]), 'Seuls les modérateurs');
await ko('un admin sans double authentification non plus', en(ADMIN, `select public.delete_game($1)`, [jeu], 'aal1'), 'Seuls les modérateurs');
await ko('un visiteur ne peut même pas appeler la fonction', en(null, `select public.delete_game($1)`, [jeu]), 'permission denied');
await ko('jeu présent dans la collection d\'un membre : refusé', en(ADMIN, `select public.delete_game($1)`, [jeu]), 'membre(s)');
await ko('…version possédée : refusée aussi', en(ADMIN, `select public.delete_release($1)`, [ff7fr]), 'membre(s)');
const jetable = (await en(ADMIN, `insert into public.game (title) values ('Jeu À Supprimer') returning id`)).rows[0].id;
const [v1, v2] = (await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Jeu À Supprimer', 'PAL'), ($1, $2, 'Jeu À Supprimer JP', 'NTSC-J') returning id`, [jetable, ps1])).rows.map((r) => r.id);
await en(ADMIN, `insert into public.image (release_id, type, path) values ($1, 'front', 'releases/test/a.webp'), ($2, 'front', 'releases/test/b.webp')`, [v1, v2]);
await en(ADMIN, `insert into public.game_genre (game_id, genre_id) select $1, id from public.genre where name = 'RPG'`, [jetable]);
const propSuppr = (await en(MEMBRE, `insert into public.submission (action, target, target_id, data) values ('update', 'game', $1, $2::jsonb) returning id`, [jetable, JSON.stringify({ summary: 'Un résumé assez long pour être accepté par la base.' })])).rows[0].id;
await egal('supprimer une version renvoie ses jaquettes (à effacer du stockage)', lignes(en(ADMIN, `select public.delete_release($1, 'Version en double') as p`, [v2])).then((r) => r[0].p), ['releases/test/b.webp']);
await ko('la dernière version ne se supprime pas seule', en(ADMIN, `select public.delete_release($1)`, [v1]), 'seule version');
await egal('supprimer le jeu renvoie les jaquettes restantes', lignes(en(ADMIN, `select public.delete_game($1, 'Jeu inexistant') as p`, [jetable])).then((r) => r[0].p), ['releases/test/a.webp']);
await egal('…le jeu, ses versions, images et genres ont disparu', val(`select (select count(*)::int from public.game where id = $1) as g, (select count(*)::int from public.release where game_id = $1) as r, (select count(*)::int from public.image where path like 'releases/test/%') as i, (select count(*)::int from public.game_genre where game_id = $1) as gg`, [jetable]), [{ g: 0, r: 0, i: 0, gg: 0 }]);
await egal('…la proposition en attente est refusée, avec un motif', val(`select status, review_note from public.submission where id = $1`, [propSuppr]), [{ status: 'rejected', review_note: 'Jeu supprimé du catalogue.' }]);
await egal('journal : la version puis le jeu, avec le motif et l\'auteur', lignes(en(ADMIN, `select kind, title, reason, deleted_by from public.catalog_deletion order by id`)),
  [{ kind: 'release', title: 'Jeu À Supprimer JP', reason: 'Version en double', deleted_by: ADMIN }, { kind: 'game', title: 'Jeu À Supprimer', reason: 'Jeu inexistant', deleted_by: ADMIN }]);
await egal('un membre ne lit pas le journal', lignes(en(MEMBRE, `select count(*)::int as n from public.catalog_deletion`)), [{ n: 0 }]);
await ko('personne n\'écrit directement dans le journal', en(ADMIN, `insert into public.catalog_deletion (kind, object_id, title) values ('game', 1, 'x')`), 'permission denied');

console.log('\nCaractéristiques d\'une version (specs)');
const specs = (v) => en(ADMIN, `update public.release set specs = $2::jsonb where id = $1`, [ff7fr, JSON.stringify(v)]);
await ok('valeurs valides : 1 bloc, analogique compatible, vibrations, GunCon', specs({ memory_card_blocks: 1, analog: 'compatible', vibration: true, peripherals: ['guncon'] }));
await ko('caractéristique inconnue de la PS1 : refusée', specs({ wifi: true }), 'Caractéristique inconnue');
await ko('16 blocs de carte mémoire : refusé (15 au plus)', specs({ memory_card_blocks: 16 }), 'nombre entier');
await ko('1,5 bloc : refusé', specs({ memory_card_blocks: 1.5 }), 'nombre entier');
await ko('analogique « parfois » : refusé', specs({ analog: 'parfois' }), 'valeur non prévue');
await ko('vibrations « oui » en texte : refusé', specs({ vibration: 'oui' }), 'oui ou non');
await ko('périphérique inconnu : refusé', specs({ peripherals: ['kinect'] }), 'valeur non prévue');
await ok('tout effacer reste possible', specs({}));
await egal('libretro : Ape Escape (USA, SCUS-94423) compatible analogique et vibrations', val(`select specs ->> 'analog' as a, specs ->> 'vibration' as v from public.release where product_code = 'SCUS-94423'`), [{ a: 'compatible', v: 'true' }]);

console.log('\nSignalements d\'erreurs');
const SIMPLE = '00000000-0000-0000-0000-00000000000d'; // membre ordinaire (AUTRE est modérateur depuis « Rôles »)
await db.query(`insert into auth.users (id) values ($1)`, [SIMPLE]);
const signaler = (uid, gameId, message, extra = {}) => en(uid, `insert into public.report (game_id, release_id, kind, message) values ($1, $2, $3, $4) returning id`,
  [gameId, extra.release ?? null, extra.kind ?? 'genre', message]);
const rapport = (await ok('un membre signale une erreur de genre', signaler(MEMBRE, jeu, 'Ce jeu est un RPG, pas un jeu de course.'))).rows[0].id;
await ko('message trop court : refusé', signaler(MEMBRE, jeu, 'Faux'), 'check');
await ko('version d\'un autre jeu : refusée', signaler(MEMBRE, jeu, 'La version indiquée est fausse.', { release: unAutrePal.id }), 'foreign key');
await ko('un membre ne choisit pas le statut', en(MEMBRE, `insert into public.report (game_id, kind, message, status) values ($1, 'other', 'Un message assez long', 'resolved')`, [jeu]), 'permission denied');
await ko('un visiteur ne peut pas signaler', signaler(null, jeu, 'Un message assez long.'), 'permission denied');
// L'une après l'autre : en() change l'identité de l'unique connexion de test
const vuParAuteur = (await lignes(en(MEMBRE, `select count(*)::int as n from public.report`)))[0].n;
const vuParAutre = (await lignes(en(SIMPLE, `select count(*)::int as n from public.report`)))[0].n;
await egal('l\'auteur voit son signalement, un autre membre non', Promise.resolve([vuParAuteur, vuParAutre]), [1, 0]);
await ko('un membre ne traite pas un signalement', en(MEMBRE, `select public.review_report($1, true)`, [rapport]), 'Seuls les modérateurs');
await ok('un admin le classe « corrigé », avec un mot', en(ADMIN, `select public.review_report($1, true, 'Merci, corrigé !')`, [rapport]));
await egal('…l\'auteur voit la réponse', lignes(en(MEMBRE, `select status, review_note from public.report where id = $1`, [rapport])), [{ status: 'resolved', review_note: 'Merci, corrigé !' }]);
await ko('…et il ne se traite pas deux fois', en(ADMIN, `select public.review_report($1, false)`, [rapport]), 'déjà traité');
for (let i = 0; i < 19; i++) await signaler(SIMPLE, jeu, `Signalement numéro ${i} pour le test.`);
await ok('20 signalements dans la journée : acceptés', signaler(SIMPLE, jeu, 'Signalement numéro 20 pour le test.'));
await ko('le 21e : refusé (anti-abus)', signaler(SIMPLE, jeu, 'Signalement numéro 21 pour le test.'), '20 signalements');

console.log('\nHistorique des modifications');
await egal('les imports (migrations) ne sont pas dans l\'historique', val(`select count(*)::int as n from public.catalog_change where changed_by is null`), [{ n: 0 }]);
const hist = (await en(ADMIN, `insert into public.game (title) values ('Jeu Historique') returning id`)).rows[0].id;
await ok('un admin renomme le jeu', en(ADMIN, `update public.game set title = 'Jeu Historique (corrigé)' where id = $1`, [hist]));
const changement = await val(`select id, action, old_values, new_values, changed_by from public.catalog_change where table_name = 'game' and row_key = $1 and action = 'update'`, [String(hist)]);
await egal('…noté : seulement le titre, avant et après, avec l\'auteur', Promise.resolve(changement.map((c) => [c.action, c.old_values, c.new_values, c.changed_by])),
  [['update', { title: 'Jeu Historique' }, { title: 'Jeu Historique (corrigé)' }, ADMIN]]);
await egal('un membre ne lit pas l\'historique', lignes(en(MEMBRE, `select count(*)::int as n from public.catalog_change`)), [{ n: 0 }]);
await ko('un membre n\'annule pas', en(MEMBRE, `select public.undo_catalog_change($1)`, [changement[0].id]), 'Seuls les modérateurs');
await ok('un admin annule le renommage', en(ADMIN, `select public.undo_catalog_change($1)`, [changement[0].id]));
await egal('…le titre est rétabli', val(`select title from public.game where id = $1`, [hist]), [{ title: 'Jeu Historique' }]);
await ko('…et on n\'annule pas deux fois', en(ADMIN, `select public.undo_catalog_change($1)`, [changement[0].id]), 'déjà été annulée');
await en(ADMIN, `update public.game set title = 'Titre A' where id = $1`, [hist]);
const versA = (await val(`select max(id) as id from public.catalog_change where table_name = 'game' and row_key = $1`, [String(hist)]))[0].id;
await en(ADMIN, `update public.game set title = 'Titre B' where id = $1`, [hist]);
await ko('annuler une modification écrasée depuis : refusé', en(ADMIN, `select public.undo_catalog_change($1)`, [versA]), 'modifiés depuis');
await en(ADMIN, `insert into public.game_genre (game_id, genre_id) select $1, id from public.genre where name = 'RPG'`, [hist]);
const ajoutGenre = (await val(`select max(id) as id from public.catalog_change where table_name = 'game_genre' and game_id = $1`, [hist]))[0].id;
await ok('annuler l\'ajout d\'un genre', en(ADMIN, `select public.undo_catalog_change($1)`, [ajoutGenre]));
await egal('…le genre est retiré', val(`select count(*)::int as n from public.game_genre where game_id = $1`, [hist]), [{ n: 0 }]);

console.log('\nDéplacer une version vers un autre jeu');
const jeuA = (await en(ADMIN, `insert into public.game (title) values ('Jeu Mal Rangé') returning id`)).rows[0].id;
const jeuB = (await en(ADMIN, `insert into public.game (title) values ('Jeu Bon Endroit') returning id`)).rows[0].id;
const [bonne, egaree] = (await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Jeu Mal Rangé', 'PAL'), ($1, $2, 'Version Égarée', 'NTSC-J') returning id`, [jeuA, ps1])).rows.map((r) => r.id);
const platEgaree = (await en(ADMIN, `insert into public.release (game_id, platform_id, reissue_of, local_title, zone, edition_type, edition_name) values ($1, $2, $3, 'Version Égarée', 'NTSC-J', 'reissue', 'The Best') returning id`, [jeuA, ps1, egaree])).rows[0].id;
await en(MEMBRE, `insert into public.collection_item (release_id) values ($1)`, [egaree]);
await ko('un membre ne déplace pas une version', en(MEMBRE, `select public.move_release($1, $2)`, [egaree, jeuB]), 'Seuls les modérateurs');
await ok('un admin déplace la version égarée vers le bon jeu', en(ADMIN, `select public.move_release($1, $2)`, [egaree, jeuB]));
await egal('…elle est sous le bon jeu, et l\'exemplaire du membre l\'a suivie', val(`select r.game_id, (select count(*)::int from public.collection_item c where c.release_id = r.id) as n from public.release r where r.id = $1`, [egaree]), [{ game_id: jeuB, n: 1 }]);
await egal('…la réédition restée sur l\'ancien jeu n\'y est plus rattachée', val(`select reissue_of from public.release where id = $1`, [platEgaree]), [{ reissue_of: null }]);
await egal('…le déplacement est dans l\'historique', val(`select old_values, new_values from public.catalog_change where table_name = 'release' and row_key = $1 and action = 'update' order by id desc limit 1`, [String(egaree)]).then((r) => r[0] && [r[0].old_values.game_id, r[0].new_values.game_id]), [jeuA, jeuB]);
await ko('la dernière version d\'un jeu ne se déplace pas', en(ADMIN, `select public.move_release($1, $2)`, [egaree, jeuA]), 'seule version');
void bonne;

console.log('\nSupprimer son compte (RGPD)');
const PARTANT = '00000000-0000-0000-0000-00000000000e';
await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"username":"Partant"}')`, [PARTANT]);
await en(PARTANT, `insert into public.collection_item (release_id) values ($1)`, [ff7fr]);
await en(PARTANT, `insert into public.submission (action, target, data) values ('create', 'game', '{"game": {"title": "Proposition En Attente"}, "no_cover": true}')`);
const rapportPartant = (await en(PARTANT, `insert into public.report (game_id, kind, message) values ($1, 'title', 'Le titre comporte une faute.') returning id`, [jeu])).rows[0].id;
await ko('confirmation mal tapée : refusé', en(PARTANT, `select public.delete_my_account('supprimer')`), 'SUPPRIMER');
await ko('un visiteur ne peut pas appeler la fonction', en(null, `select public.delete_my_account('SUPPRIMER')`), 'permission denied');
await ko('le dernier admin ne peut pas partir', en(ADMIN, `select public.delete_my_account('SUPPRIMER')`), 'dernier admin');
await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [PARTANT]);
await ko('double authentification activée mais pas validée : refusé', en(PARTANT, `select public.delete_my_account('SUPPRIMER')`), 'double authentification');
await ok('le membre supprime son compte (session validée)', en(PARTANT, `select public.delete_my_account('SUPPRIMER')`, [], 'aal2'));
await egal('…compte, profil, collection et proposition en attente effacés', val(`select
    (select count(*)::int from auth.users where id = $1) as compte,
    (select count(*)::int from public.profile where id = $1) as profil,
    (select count(*)::int from public.collection_item where profile_id = $1) as collection,
    (select count(*)::int from public.submission where data -> 'game' ->> 'title' = 'Proposition En Attente') as proposition`, [PARTANT]),
  [{ compte: 0, profil: 0, collection: 0, proposition: 0 }]);
await egal('…son signalement reste, sans auteur', val(`select author_id from public.report where id = $1`, [rapportPartant]), [{ author_id: null }]);

console.log('\nVersions nationales PAL et rééditions (Redump)');
await egal('FF7 Allemagne (SCES-00869) : version PAL créée, rattachée à l\'Allemagne, 3 disques',
  val(`select r.zone, r.media_count, rg.code from public.release r join public.release_region rr on rr.release_id = r.id join public.region rg on rg.id = rr.region_id where r.product_code = 'SCES-00869'`),
  [{ zone: 'PAL', media_count: 3, code: 'DE' }]);
await egal('FF7 : France, Allemagne et Espagne créées une seule fois chacune', val(`select product_code, count(*)::int as n from public.release where product_code in ('SCES-00868', 'SCES-00869', 'SCES-00900') group by 1 order by 1`),
  [{ product_code: 'SCES-00868', n: 1 }, { product_code: 'SCES-00869', n: 1 }, { product_code: 'SCES-00900', n: 1 }]);
// Codes en double dans un jeu : SCES-99868 et SLES-01234 sont les jeux de test (Platinum au même
// code que la version normale, voulu) ; SLES-01433 : All Star Tennis '99, un seul disque européen pour
// deux boîtes (« Yannick Noah »). Les codes recopiés par erreur sont corrigés (fix_copied_codes).
await egal('codes en double dans un jeu : seulement les cas connus d\'avant l\'import Redump',
  val(`select string_agg(distinct product_code, ',' order by product_code) as c from (select game_id, product_code from public.release where product_code is not null group by 1, 2 having count(*) > 1) x`),
  [{ c: 'SCES-99868,SLES-01234,SLES-01433' }]);

console.log('\nVersions sans jaquette');
const sansJaquette = (args, uid = MEMBRE) => lignes(en(uid, `select id, stand_in_path, total_count from public.releases_without_cover('PS1', $1, null, $2, 1, 100)`, args));
const ff7platinum = (await val(`select id from public.release where reissue_of = $1 and edition_name = 'Platinum'`, [ff7fr]))[0].id;
await en(ADMIN, `insert into public.image (release_id, type, path) values ($1, 'back', 'test/ff7-fr-dos.webp')`, [ff7fr]);
await egal('un verso seul ne compte pas : la version d\'origine est dans la file', sansJaquette(['standard', 'SCES-99868']).then((r) => r.map((x) => x.id)), [ff7fr]);
await en(ADMIN, `insert into public.image (release_id, type, path) values ($1, 'front', 'test/ff7-fr.webp')`, [ff7fr]);
await egal('la Platinum de FF7 est dans la file, avec le recto de la version d\'origine en attendant',
  sansJaquette(['reissue', 'SCES-99868']).then((r) => r.map((x) => [x.id, x.stand_in_path])), [[ff7platinum, 'test/ff7-fr.webp']]);
await egal('…mais plus la version d\'origine, qui a son recto', sansJaquette([null, 'SCES-99868']).then((r) => r.some((x) => x.id === ff7fr)), false);
await en(ADMIN, `insert into public.image (release_id, type, path) values ($1, 'front', 'test/ff7-platinum.webp')`, [ff7platinum]);
await egal('jaquette ajoutée : la Platinum quitte la file', sansJaquette(['reissue', 'SCES-99868']).then((r) => r.length), 0);
await ko('un visiteur ne peut pas lire la file', sansJaquette([null, null], null), 'permission denied');
await en(ADMIN, `delete from public.image where path like 'test/ff7-%'`);

console.log('\nCohérence du catalogue (imports compris)');
await egal('chaque jeu importé a au moins une sortie', val(`select count(*)::int as n from public.game g where g.wikidata_id is not null and not exists (select 1 from public.release r where r.game_id = g.id)`), [{ n: 0 }]);
await egal('chaque date de sortie est cohérente avec sa précision', val(`select count(*)::int as n from public.release_region where (release_date is null) <> (date_precision is null)`), [{ n: 0 }]);
await egal('aucune réédition vers un autre jeu', val(`select count(*)::int as n from public.release r join public.release o on o.id = r.reissue_of where o.game_id <> r.game_id`), [{ n: 0 }]);

console.log(echecs ? `\n${echecs} test(s) en échec` : '\nTous les tests passent');
process.exit(echecs ? 1 : 0);
