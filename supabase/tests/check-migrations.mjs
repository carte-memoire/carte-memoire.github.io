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
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}', encrypted_password text);
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, factor_type text not null default 'totp', status text not null, created_at timestamptz not null default now());
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
// extra : autres informations du jeton (identifiant de session, méthodes de connexion…)
async function en(uid, sql, params = [], aal = uid === ADMIN ? 'aal2' : 'aal1', extra = {}) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [uid ? JSON.stringify({ sub: uid, aal, ...extra }) : '']);
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
await egal('PS2 présente avec ses 8 champs spécifiques', val(`select short_name, jsonb_array_length(spec_fields) as n from public.platform where short_name = 'PS2'`), [{ short_name: 'PS2', n: 8 }]);
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
await egal('collection publique : la table ne montre rien aux visiteurs (prix, notes…)', lignes(en(null, `select count(*)::int as n from public.collection_item`)), [{ n: 0 }]);
await egal('…et aux autres membres', lignes(en(AUTRE, `select count(*)::int as n from public.collection_item`)), [{ n: 0 }]);
await egal('…la page publique montre ses 2 exemplaires', lignes(en(null, `select count(*)::int as n from public.public_collection((select username from public.profile where id = $1))`, [MEMBRE])), [{ n: 2 }]);
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
const traiter = (uid, id, approve, note = null, cover = null, attach = null, aal, studios = null) =>
  en(uid, `select public.review_submission($1, $2, $3, $4, $5, $6::jsonb) as r`, [id, approve, note, cover, attach, studios && JSON.stringify(studios)], aal);
const versionPAL = { platform_id: Number(ps1), zone: 'PAL', local_title: 'Mon Jeu Perdu', product_code: 'sles-01234', edition_type: 'standard', languages: ['fr', 'en'], region_code: 'FR', release_date: '1999-03-01', date_precision: 'month', publisher_name: 'Éditeur Inconnu', developer_name: 'Studio Fantôme' };

const p1 = await soumettre({ game: { title: 'Mon Jeu Perdu' }, release: versionPAL, no_cover: true });
await ko('un membre ne peut pas traiter une proposition', traiter(MEMBRE, p1, true), 'Seuls les modérateurs');
await ko('un visiteur non plus', en(null, `select public.review_submission($1, true)`, [p1]), 'permission denied');
await ko('un admin sans double authentification non plus', traiter(ADMIN, p1, true, null, null, null, 'aal1'), 'Seuls les modérateurs');
await ko("studios inconnus : la validation s'arrête et demande une décision", traiter(ADMIN, p1, true), 'Nouveau studio « Éditeur Inconnu »');
await egal("…rien n'a été créé", val(`select count(*)::int as n from public.company where name in ('Éditeur Inconnu', 'Studio Fantôme')`), [{ n: 0 }]);
const r1 = await ok('un admin accepte un nouveau jeu, en confirmant la création des deux studios', traiter(ADMIN, p1, true, null, null, null, undefined, { publisher: 'create', developer: 'create' }));
const cree = r1.rows[0].r;
await egal('le jeu est créé avec sa première sortie', val(`select title, first_release_date::text as d, first_release_precision as p from public.game where id = $1`, [cree.game_id]), [{ title: 'Mon Jeu Perdu', d: '1999-03-01', p: 'month' }]);
await egal('la version est créée (code produit en majuscules)', val(`select zone, local_title, product_code, languages from public.release where id = $1`, [cree.release_id]), [{ zone: 'PAL', local_title: 'Mon Jeu Perdu', product_code: 'SLES-01234', languages: ['fr', 'en'] }]);
await egal('…avec sa date en France', val(`select rg.code, rr.release_date::text as d from public.release_region rr join public.region rg on rg.id = rr.region_id where rr.release_id = $1`, [cree.release_id]), [{ code: 'FR', d: '1999-03-01' }]);
await egal('…son éditeur et son développeur (studios créés sur confirmation)', val(`select (select c.name from public.release_company rc join public.company c on c.id = rc.company_id where rc.release_id = $1) as editeur, (select c.name from public.game_developer gd join public.company c on c.id = gd.company_id where gd.game_id = $2) as dev`, [cree.release_id, cree.game_id]), [{ editeur: 'Éditeur Inconnu', dev: 'Studio Fantôme' }]);
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
const studioExistant = (await val(`select id from public.company where name = 'Éditeur Inconnu'`))[0].id;
const p5 = await soumettre({ game: { title: 'Jeu Studio Liste' }, release: { ...versionPAL, local_title: 'Jeu Studio Liste', publisher_name: undefined, publisher_id: Number(studioExistant), developer_name: 'Studoi Fantome' }, no_cover: true });
await ko('faute de frappe dans un développeur : décision demandée', traiter(ADMIN, p5, true), 'Nouveau studio « Studoi Fantome »');
const fantome = (await val(`select id from public.company where name = 'Studio Fantôme'`))[0].id;
const r5 = (await ok('le modérateur choisit le bon studio existant à la place', traiter(ADMIN, p5, true, null, null, null, undefined, { developer: Number(fantome) }))).rows[0].r;
await egal('…éditeur choisi dans la liste, développeur corrigé, aucun studio mal orthographié créé',
  val(`select (select rc.company_id from public.release_company rc where rc.release_id = $1) as ed, (select gd.company_id from public.game_developer gd where gd.game_id = $2) as dev,
    (select count(*)::int from public.company where name = 'Studoi Fantome') as faute`, [r5.release_id, r5.game_id]),
  [{ ed: studioExistant, dev: fantome, faute: 0 }]);
const p6 = await soumettre({ game: { title: 'Jeu Sans Studio' }, release: { ...versionPAL, local_title: 'Jeu Sans Studio', publisher_name: 'Editeur Douteux', developer_name: undefined }, no_cover: true });
const r6 = (await ok('le modérateur retire un studio douteux', traiter(ADMIN, p6, true, null, null, null, undefined, { publisher: 'skip' }))).rows[0].r;
await egal('…la version est créée sans éditeur', val(`select count(*)::int as n from public.release_company where release_id = $1`, [r6.release_id]), [{ n: 0 }]);
await ko('un studio choisi qui n\'existe pas : refusé', traiter(ADMIN, await soumettre({ game: { title: 'Jeu Fantôme 2' }, release: { ...versionPAL, local_title: 'X' }, no_cover: true }), true, null, null, null, undefined, { publisher: -1, developer: 'skip' }), "n'existe plus");

console.log('\nHistorique des studios (Modifier ce jeu)');
await ok('un modérateur ajoute un développeur au jeu', en(ADMIN, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [cree.game_id, studioExistant]));
const ajoutDev = (await val(`select id, new_values ->> 'company_name' as nom from public.catalog_change where table_name = 'game_developer' and game_id = $1 order by id desc limit 1`, [cree.game_id]))[0];
await egal('…dans l\'historique, avec le nom du studio', Promise.resolve(ajoutDev?.nom), 'Éditeur Inconnu');
await ok('…puis annule cet ajout', en(ADMIN, `select public.undo_catalog_change($1)`, [ajoutDev.id]));
await egal('…le développeur est retiré', val(`select count(*)::int as n from public.game_developer where game_id = $1 and company_id = $2`, [cree.game_id, studioExistant]), [{ n: 0 }]);
await ko('un membre ne peut pas changer les studios', en(MEMBRE, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [cree.game_id, studioExistant]), 'row-level security');
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
                                     ownership => $6, search => $7, sort_by => $8, page_number => $9, page_size => $10,
                                     origin_filter => $11, company_filter => $12, series_filter => $13)`,
  [a.console === undefined ? 'PS1' : a.console, a.zone ?? null, a.letter ?? null, a.family ?? null, a.year ?? null,
   a.ownership ?? null, a.search ?? null, a.sort ?? 'title', a.page ?? 1, a.size ?? 50, a.origin ?? null, a.studio ?? null, a.series ?? null]));
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
await egal("pages de 1 000 : choix « 1 000 par page » de l'internaute", catalogue(null, { zone: 'PAL', size: 1000 }).then((r) => r.length), Math.min(1000, totalPal));
await egal('au-delà, plafonné à 1 000 (« tout » se lit en plusieurs appels)', catalogue(null, { size: 100000 }).then((r) => r.length <= 1000 && r.length === Math.min(1000, r[0].total_count)), true);
await egal('chaque version donne ses langues (versions nationales sans code produit à l\'écran)',
  catalogue(null, { zone: 'PAL', search: 'final fantasy vii' }).then((r) => ff7(r)?.releases.map((x) => x.languages)), [['fr'], ['fr']]);
await egal('année 1997 : uniquement des jeux sortis en 1997', catalogue(null, { zone: 'PAL', year: 1997 }).then((r) => r.length > 0 && r.every((x) => String(x.release_date).includes('1997') || new Date(x.release_date).getUTCFullYear() === 1997)), true);
await egal('tri par date : du plus ancien au plus récent', catalogue(null, { zone: 'PAL', sort: 'date', size: 100 }).then((r) => r.filter((x) => x.release_date).every((x, i, a) => i === 0 || new Date(a[i - 1].release_date) <= new Date(x.release_date))), true);
await egal('tri par date décroissante : du plus récent au plus ancien', catalogue(null, { zone: 'PAL', sort: 'date_desc', size: 100 }).then((r) => r.length > 0 && r.filter((x) => x.release_date).every((x, i, a) => i === 0 || new Date(a[i - 1].release_date) >= new Date(x.release_date))), true);
await egal('tri par titre de Z à A', catalogue(null, { zone: 'PAL', sort: 'title_desc', size: 50 }).then((r) => r.length > 0 && r.map((x) => sansAccent(x.display_title)).every((t, i, a) => i === 0 || a[i - 1] >= t)), true);
await egal('tri par nombre de versions : le plus de versions d\'abord', catalogue(null, { zone: 'PAL', sort: 'versions', size: 100 }).then((r) => r.length > 0 && r[0].releases.length > 1 && r.every((x, i, a) => i === 0 || a[i - 1].releases.length >= x.releases.length)), true);
await egal('tri par ajout : le dernier jeu ajouté en tête', catalogue(null, { console: null, sort: 'added', size: 5 }).then((r) => r[0]?.id),
  (await val(`select g.id from public.game g where exists (select 1 from public.release r where r.game_id = g.id) order by g.created_at desc, g.id desc limit 1`))[0].id);
await egal('console inconnue : aucun jeu',catalogue(null, { console: 'XYZ' }).then((r) => r.length), 0);
await egal("date inconnue en PAL : celle d'une autre zone PS1 (1995), pas celle de la borne d'arcade (1992, Viewpoint)",
  catalogue(null, { zone: 'PAL', search: 'viewpoint' }).then((r) => r.filter((x) => x.title === 'Viewpoint').map((x) => new Date(x.release_date).getUTCFullYear())), [1995]);
await egal('tri par date en PAL : aucune date avant le lancement de la PS1', catalogue(null, { zone: 'PAL', sort: 'date', size: 20 })
  .then((r) => r.every((x) => !x.release_date || new Date(x.release_date) >= new Date('1994-12-03'))), true);
await egal('recherche par code produit dans le catalogue', catalogue(null, { zone: 'PAL', search: 'SCES-99868' }).then((r) => r.some((x) => x.id === jeu)), true);
const rpg = (await val(`select id from public.genre where name = 'Tactical RPG'`))[0].id;
await ok('FF7 de test classé en Tactical RPG', en(ADMIN, `insert into public.game_genre (game_id, genre_id) values ($1, $2)`, [jeu, rpg]));
await egal('famille RPG : le Tactical RPG y figure', catalogue(MEMBRE, { zone: 'PAL', family: 'rpg', ownership: 'owned' }).then((r) => r.map((x) => x.id)), [jeu]);
const unAutrePal = (await val(`select id, game_id from public.release where zone = 'PAL' and game_id <> $1 order by id limit 1`, [jeu]))[0];
await ok('le membre cherche un autre jeu PAL', en(MEMBRE, `insert into public.collection_item (release_id, status) values ($1, 'wanted')`, [unAutrePal.id]));
await egal('filtre « recherchés »', catalogue(MEMBRE, { zone: 'PAL', ownership: 'wanted' }).then((r) => r.map((x) => x.id)), [unAutrePal.game_id]);

const progression = (uid, zone = null, origin = null) => lignes(en(uid, `select scope, code, total, owned, wanted from public.collection_progress('PS1', $1, $2)`, [zone, origin]))
  .then((rows) => Object.fromEntries(rows.map((r) => [`${r.scope}:${r.code}`, [r.total, r.owned, r.wanted]])));
const prog = await progression(MEMBRE, 'PAL');
await egal('progression PAL : 1 jeu possédé (3 exemplaires = 1 jeu), 1 recherché', Promise.resolve(prog['zone:PAL']), [totalPal, 1, 1]);
await egal('progression RPG (zone PAL) : 1 possédé', Promise.resolve(prog['family:rpg']?.[1]), 1);
await egal('…et Stratégie aussi : un Tactical RPG compte dans ses deux familles', Promise.resolve(prog['family:strategy']?.[1]), 1);
await egal('progression : les jeux classés par famille sont comptés', Promise.resolve(prog['family:known']?.[0] > 0), true);
await egal('un autre membre : rien de possédé', progression(AUTRE, 'PAL').then((p) => [p['zone:PAL'][1], p['zone:all'][1]]), [0, 0]);
await egal('un visiteur : la progression se calcule, à zéro', progression(null).then((p) => p['zone:all'][1]), 0);

console.log('\nOrigine des jeux (JRPG = RPG + Japon)');
const origine = (id) => val(`select public.origin(g) as o from public.game g where g.id = $1`, [id]).then((r) => r[0].o);
const studio = async (name, country) => (await en(ADMIN, `insert into public.company (name, country) values ($1, $2) returning id`, [name, country])).rows[0].id;
await egal('FF7 de test, sans studio : origine inconnue', origine(jeu), null);
const studioJp = await studio('Studio Test Tokyo', 'JP');
await ok('un studio japonais développe le FF7 de test', en(ADMIN, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [jeu, studioJp]));
await egal('…origine déduite du studio : Japon', origine(jeu), 'JP');
await egal("lisible par l'API comme un champ du jeu", lignes(en(null, `select g.origin from public.game g where g.id = $1`, [jeu])), [{ origin: 'JP' }]);
await egal('catalogue RPG + Japon (JRPG) : FF7 y est', catalogue(MEMBRE, { zone: 'PAL', family: 'rpg', ownership: 'owned', origin: 'japan' }).then((r) => r.map((x) => x.id)), [jeu]);
await egal('RPG hors Japon : pas FF7', catalogue(MEMBRE, { zone: 'PAL', family: 'rpg', ownership: 'owned', origin: 'other' }).then((r) => r.length), 0);
await egal('progression JRPG (PAL) : 1 possédé', progression(MEMBRE, 'PAL', 'japan').then((p) => p['family:rpg']?.[1]), 1);
await egal('progression hors Japon : aucun RPG possédé', progression(MEMBRE, 'PAL', 'other').then((p) => p['family:rpg']?.[1] ?? 0), 0);
await egal('origines Japon + hors Japon + inconnue = tous les jeux PAL', progression(MEMBRE, 'PAL').then((p) =>
  ['japan', 'other', 'unknown'].reduce((n, o) => n + (p[`origin:${o}`]?.[0] ?? 0), 0)), totalPal);
await egal('filtre Japon : le total de la zone est celui des jeux japonais', progression(MEMBRE, 'PAL', 'japan').then((p) => p['zone:PAL'][0] === p['origin:japan'][0]), true);
const studioInconnu = await studio('Studio Test Sans Pays', null);
await ok('un second studio, de pays inconnu', en(ADMIN, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [jeu, studioInconnu]));
await egal('…origine inconnue : on ne devine pas', origine(jeu), null);
await ok('son pays est renseigné : États-Unis', en(ADMIN, `update public.company set country = 'US' where id = $1`, [studioInconnu]));
await egal('…coproduction Japon / États-Unis : reste à trancher', origine(jeu), null);
await ok('un modérateur tranche : Japon', en(ADMIN, `update public.game set origin_country = 'JP' where id = $1`, [jeu]));
await egal("…le choix du modérateur l'emporte", origine(jeu), 'JP');
await ok("un membre tente de changer l'origine…", en(MEMBRE, `update public.game set origin_country = 'US' where id = $1`, [jeu]));
await egal('…sans effet (réservé aux modérateurs)', origine(jeu), 'JP');
await ko('code pays mal écrit : refusé', en(ADMIN, `update public.game set origin_country = 'Japon' where id = $1`, [jeu]), 'origin_country');
const origineDe = (title) => val(`select public.origin(g) as o from public.game g where g.title = $1`, [title]).then((r) => r.map((x) => x.o));
await egal('import Wikidata : Diablo vient des États-Unis', origineDe('Diablo'), ['US']);
await egal('…Darkstone, de France', origineDe('Darkstone'), ['FR']);
await egal('…un développeur indépendant prend sa nationalité (Chris Sawyer)', val(`select country from public.company where name = 'Chris Sawyer'`), [{ country: 'GB' }]);
await ok('nettoyage', en(ADMIN, `update public.game set origin_country = null where id = $1;`, [jeu]));
await ok('…des studios de test', en(ADMIN, `delete from public.game_developer where game_id = $1`, [jeu]));

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

console.log('\nUn jeu sur deux consoles (PS1 et PS2)');
const ps2 = (await val(`select id from public.platform where short_name = 'PS2'`))[0].id;
const ff7ps2 = (await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Final Fantasy VII Console Test', 'PAL') returning id`, [jeu, ps2])).rows[0].id;
await egal('la version PS2 est dans la file PS2, sans emprunter la jaquette de la version PS1',
  lignes(en(MEMBRE, `select id, stand_in_path, platform_short_name from public.releases_without_cover('PS2', null, null, 'Console Test', 1, 100)`)),
  [{ id: ff7ps2, stand_in_path: null, platform_short_name: 'PS2' }]);
await egal('…absente de la file PS1', sansJaquette([null, 'Console Test']).then((r) => r.length), 0);
await egal('…toutes consoles : chaque version dit sa console', lignes(en(MEMBRE, `select platform_short_name as p from public.releases_without_cover(null, null, null, 'Console Test', 1, 100)`)), [{ p: 'PS2' }]);
const specsPs2 = (v) => en(ADMIN, `update public.release set specs = $2::jsonb where id = $1`, [ff7ps2, JSON.stringify(v)]);
await ok('PS2 : 112 Ko, tous les boutons analogiques, 16:9 et 480p, Dolby Pro Logic II, EyeToy',
  specsPs2({ memory_card_kb: 112, analog: 'all_buttons', vibration: true, display: ['widescreen', 'progressive'], audio: ['dolby_pl2'], peripherals: ['eyetoy'] }));
await ko('PS2 : des blocs de carte mémoire PS1 sont refusés', specsPs2({ memory_card_blocks: 1 }), 'Caractéristique inconnue');
await ko('PS2 : analogique « compatible » (valeur PS1) refusé', specsPs2({ analog: 'compatible' }), 'valeur non prévue');
await ko('PS2 : 9 Mo de carte mémoire refusés (8 Mo au plus)', specsPs2({ memory_card_kb: 9000 }), 'nombre entier');
await egal('catalogue PS1 : le jeu ne montre que sa version PS1', catalogue(null, { zone: 'PAL', search: 'Final Fantasy VII' }).then((r) => r.find((x) => x.id === jeu)?.releases.every((v) => v.platform.short_name === 'PS1')), true);
await ok('nettoyage (version PS2)', en(ADMIN, `delete from public.release where id = $1`, [ff7ps2]));
const [spider1, spider2] = (await en(ADMIN, `insert into public.game (title, wikidata_id) values ('Araignée Console', 'Q999999801'), ('Araignée : Console', 'Q999999802') returning id`)).rows.map((r) => r.id);
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Araignée Console', 'PAL'), ($3, $4, 'Araignée : Console', 'PAL')`, [spider1, ps1, spider2, ps2]);
const doublonsAraignee = () => lignes(en(ADMIN, `select total from public.possible_duplicate_game where title_key = 'araigneeconsole'`));
await egal('même titre, deux fiches Wikidata, une PS1 et une PS2 : pas un doublon signalé', doublonsAraignee(), []);
await en(ADMIN, `insert into public.release (game_id, platform_id, local_title, zone) values ($1, $2, 'Araignée : Console', 'NTSC-U')`, [spider2, ps1]);
await egal('…mais signalé dès que les deux ont une version sur la même console', doublonsAraignee(), [{ total: 2 }]);
await en(ADMIN, `delete from public.release where game_id = $1 and platform_id = $2`, [spider2, ps1]);
await en(ADMIN, `update public.game set wikidata_id = null where id = $1`, [spider2]);
await egal('…ou quand l\'un n\'a pas de fiche Wikidata (peut-être la même œuvre)', doublonsAraignee(), [{ total: 2 }]);
await en(ADMIN, `delete from public.release where game_id = any($1)`, [[spider1, spider2]]);
await ok('nettoyage (homonymes de test)', en(ADMIN, `delete from public.game where id = any($1)`, [[spider1, spider2]]));
await en(ADMIN, `delete from public.image where path like 'test/ff7-%'`);

console.log('\nDates de sortie (correction de Strider, historique)');
await egal('Strider prend les dates de Strider 2, vendu avec lui (Japon : 24 février 2000, et non 2006)',
  val(`select r.zone::text as zone, rg.code, rr.release_date::text as d from public.release r join public.game g on g.id = r.game_id
       join public.release_region rr on rr.release_id = r.id join public.region rg on rg.id = rr.region_id where g.title = 'Strider' order by 1`),
  [{ zone: 'NTSC-J', code: 'JP', d: '2000-02-24' }, { zone: 'NTSC-U', code: 'north-america', d: '2000-07-29' }, { zone: 'PAL', code: 'europe', d: '2000-12-15' }]);
const france = (await val(`select id from public.region where code = 'FR'`))[0].id;
await ok('un modérateur ajoute une date de sortie (Platinum de test, France)', en(ADMIN, `insert into public.release_region (release_id, region_id, release_date, date_precision) values ($1, $2, '1998-11-01', 'month')`, [ff7platinum, france]));
await ok('…la corrige', en(ADMIN, `update public.release_region set release_date = '1998-12-01' where release_id = $1 and region_id = $2`, [ff7platinum, france]));
await egal("…les deux modifications sont dans l'historique du jeu", val(`select action, new_values ->> 'release_date' as d from public.catalog_change where table_name = 'release_region' and game_id = $1 and row_key = $2 order by id`, [jeu, `${ff7platinum}:${france}`]),
  [{ action: 'insert', d: '1998-11-01' }, { action: 'update', d: '1998-12-01' }]);
await ko('un membre ne peut pas changer une date', en(MEMBRE, `insert into public.release_region (release_id, region_id, release_date, date_precision) values ($1, (select id from public.region where code = 'DE'), '1999-01-01', 'year')`, [ff7platinum]), 'row-level security');
await ko('« novembre 1998 » doit être enregistré au 1er du mois', en(ADMIN, `update public.release_region set release_date = '1998-11-15', date_precision = 'month' where release_id = $1 and region_id = $2`, [ff7platinum, france]), 'check');
await ok('nettoyage de la date de test', en(ADMIN, `delete from public.release_region where release_id = $1 and region_id = $2`, [ff7platinum, france]));

console.log('\nStudios mal rattachés à l\'import (correction)');
const studiosDe = (title) => val(`select string_agg(c.name || coalesce(' (' || c.country || ')', ''), ', ' order by c.name) as s
  from public.game g join public.game_developer gd on gd.game_id = g.id join public.company c on c.id = gd.company_id where g.title = $1`, [title]).then((r) => r[0].s);
await egal('Re-Volt : Acclaim Studios London (déjà connu, britannique), et non une liste Wikipédia', studiosDe('Re-Volt'), 'Acclaim Studios London (GB)');
await egal('Mortal Kombat II : Midway et Probe Entertainment', studiosDe('Mortal Kombat II'), 'Midway Games (US), Probe Entertainment');
await egal('Tenchu : un seul Acquire, le vrai (Japon), plus le jeu de société', studiosDe('Tenchu: Stealth Assassins'), 'Acquire (JP)');
await egal('Tintin: Destination Adventure : Infogrames et Runecraft, et non « Runic magic »', studiosDe('Tintin: Destination Adventure'), 'Infogrames (FR), Runecraft (GB)');
// Des homonymes distincts dans Wikidata existent (Atari, Inc. de 1972 et de 1993…) ; pas un
// studio sans lien à côté d'un autre du même nom (comme le faux « Acquire » à côté du vrai).
// Studios des jeux PS1 (ceux de la correction) : un doublon plus ancien entre une fiche éditeur
// et une fiche développeur (« Dazz ») peut ressortir avec la PS2, il se fusionne en modération.
await egal('pas de studio PS1 en double du même nom (hors homonymes distincts dans Wikidata)', val(`select string_agg(name_key, ', ') as d from (
  select c.name_key from public.company c where exists (
    select 1 from public.game_developer gd join public.release r on r.game_id = gd.game_id join public.platform p on p.id = r.platform_id
    where gd.company_id = c.id and p.short_name = 'PS1')
  group by c.name_key having count(*) > 1 and count(*) > count(distinct c.wikidata_id)) x`), [{ d: null }]);
await egal('Nightmare Creatures : Kalisto, studio français → origine France', val(`select public.origin(g) as o from public.game g where g.title = 'Nightmare Creatures'`), [{ o: 'FR' }]);
await egal('plus aucun studio au nom de liste Wikipédia', val(`select count(*)::int as n from public.company where name ilike 'list of %'`), [{ n: 0 }]);
await egal('plus de « rail transport in Malawi » (ni son faux pays)', val(`select count(*)::int as n from public.company where name = 'rail transport in Malawi' or country = 'MW'`), [{ n: 0 }]);
await egal('le faux lien Wikidata de Kalisto (un groupe pirate) est retiré', val(`select count(*)::int as n from public.company where wikidata_id = 'Q6353182'`), [{ n: 0 }]);

console.log('\nStudios : recherche, résumé, catalogue filtré, fusion');
const studioA = (await en(ADMIN, `insert into public.company (name, country) values ('Squaresoft Test', 'JP') returning id`)).rows[0].id;
const studioB = (await en(ADMIN, `insert into public.company (name) values ('Squaresfot Test') returning id`)).rows[0].id;
await ok('Squaresoft Test développe le FF7 de test', en(ADMIN, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [jeu, studioA]));
await ok('…et son doublon mal orthographié aussi', en(ADMIN, `insert into public.game_developer (game_id, company_id) values ($1, $2)`, [jeu, studioB]));
await ok('…qui édite la version PAL française', en(ADMIN, `insert into public.release_company (release_id, company_id, role) values ($1, $2, 'publisher')`, [ff7fr, studioB]));
await egal('recherche « squaresoft test » (visiteur) : le studio, 1 jeu développé', lignes(en(null, `select name, developed, published from public.search_companies('squaresoft test', 'PS1')`)),
  [{ name: 'Squaresoft Test', developed: 1, published: 0 }]);
await egal('recherche « squaresoft » : le nom exact en premier (le vrai Squaresoft, éditeur)', lignes(en(null, `select name from public.search_companies('squaresoft', 'PS1')`)).then((r) => r[0]?.name), 'Squaresoft');
await egal('sans recherche : tous les studios ayant des jeux (outil de modération)', lignes(en(null, `select count(*)::int as n from public.search_companies(null, null, 2000)`)).then((r) => r[0].n > 100), true);
await egal('résumé du studio sur PS1 : 1 jeu, première sortie en 1997', lignes(en(null, `select name, country, developed, published, first_year from public.company_summary($1, 'PS1')`, [studioA])),
  [{ name: 'Squaresoft Test', country: 'JP', developed: 1, published: 0, first_year: 1997 }]);
await egal('catalogue filtré par studio (développeur) : le FF7 de test', catalogue(null, { zone: 'PAL', studio: studioA }).then((r) => r.map((x) => x.id)), [jeu]);
await egal('…par éditeur, dans sa zone (PAL) : le FF7 de test', catalogue(null, { zone: 'PAL', studio: studioB }).then((r) => r.map((x) => x.id)), [jeu]);
await egal('…un studio sans jeu : catalogue vide', catalogue(null, { zone: 'PAL', studio: -1 }).then((r) => r.length), 0);
await ko('un membre ne peut pas fusionner des studios', en(SIMPLE, `select public.merge_companies($1, $2)`, [studioA, studioB]), 'Seuls les modérateurs');
await ko('un modérateur sans double authentification non plus', en(ADMIN, `select public.merge_companies($1, $2)`, [studioA, studioB], 'aal1'), 'Seuls les modérateurs');
await ko('un visiteur ne peut même pas l\'appeler', en(null, `select public.merge_companies($1, $2)`, [studioA, studioB]), 'permission denied');
await ok('le modérateur fusionne le doublon dans le bon studio', en(ADMIN, `select public.merge_companies($1, $2)`, [studioA, studioB]));
await egal('…le doublon a disparu', val(`select count(*)::int as n from public.company where id = $1`, [studioB]), [{ n: 0 }]);
await egal('…le jeu n\'a plus qu\'un seul lien vers le studio', val(`select count(*)::int as n from public.game_developer where game_id = $1 and company_id = $2`, [jeu, studioA]), [{ n: 1 }]);
await egal('…la version éditée passe au bon studio', val(`select count(*)::int as n from public.release_company where release_id = $1 and company_id = $2 and role = 'publisher'`, [ff7fr, studioA]), [{ n: 1 }]);
await egal('…une proposition qui écrit l\'ancien nom retrouve le bon studio', val(`select private.company_by_name('Squaresfot Test') = $1 as ok`, [studioA]), [{ ok: true }]);
await ko('un membre ne peut pas écarter une paire de studios', en(SIMPLE, `insert into public.dismissed_company_duplicate (company_a, company_b) values (1, 2)`), 'row-level security');
await ko('les anciens noms ne sont pas lisibles par l\'API', en(SIMPLE, `select * from public.company_alias`), 'permission denied');

console.log('\nCodes-barres des versions (scan)');
const ean13 = (base) => base + String((10 - [...base].reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0) % 10) % 10);
await egal('EAN-13 valide : gardé tel quel', val(`select private.normalize_barcode('4006381333931') as v`), [{ v: '4006381333931' }]);
await egal('UPC-A (boîtes américaines) : complété en EAN-13', val(`select private.normalize_barcode('036000291452') as v`), [{ v: '0036000291452' }]);
await egal('EAN-8 valide : gardé', val(`select private.normalize_barcode('96385074') as v`), [{ v: '96385074' }]);
await egal('clé de contrôle fausse (code mal lu) : refusé', val(`select private.normalize_barcode('4006381333932') as v`), [{ v: null }]);
await egal('espaces et tirets ignorés', val(`select private.normalize_barcode('4 006381-333931') as v`), [{ v: '4006381333931' }]);
await egal('le calcul de la clé côté tests est le même', Promise.resolve(ean13('400638133393')), '4006381333931');
await ko('un visiteur ne peut pas associer de code', en(null, `select public.add_release_barcode($1, $2)`, [ff7fr, '4006381333931']), 'permission denied');
await ko('un visiteur ne peut pas appeler la normalisation (schéma privé)', en(null, `select private.normalize_barcode('4006381333931')`), 'permission denied');
await ko('un membre non plus, directement', en(SIMPLE, `select private.normalize_barcode('4006381333931')`), 'permission denied');
await egal('un membre associe le code de sa boîte à sa version', lignes(en(SIMPLE, `select public.add_release_barcode($1, $2) as code`, [ff7fr, '4 006381 333931'])), [{ code: '4006381333931' }]);
await egal('…le même code sur la même version : sans effet, pas d\'erreur', lignes(en(SIMPLE, `select public.add_release_barcode($1, $2) as code`, [ff7fr, '4006381333931'])), [{ code: '4006381333931' }]);
await ko('code à la clé fausse : refusé', en(SIMPLE, `select public.add_release_barcode($1, $2)`, [ff7fr, '4006381333932']), 'Code-barres invalide');
await ko('version inexistante : refusé', en(SIMPLE, `select public.add_release_barcode($1, $2)`, [-1, ean13('500000000001')]), 'Version introuvable');
await ko('un autre membre ne peut pas déplacer ce code vers une autre version', en(AUTRE, `select public.add_release_barcode($1, $2)`, [ff7platinum, '4006381333931'], 'aal1'), 'déjà associé');
await ko('l\'écriture directe dans la table est fermée', en(SIMPLE, `insert into public.release_barcode (barcode, release_id) values ($1, $2)`, [ean13('500000000002'), ff7fr]), 'permission denied');
await egal('un visiteur qui scanne retrouve la version (espaces compris)', lignes(en(null, `select release_id, game_title, zone, languages from public.releases_by_barcode('4 006381 333931')`)),
  [{ release_id: ff7fr, game_title: 'Final Fantasy VII', zone: 'PAL', languages: ['fr'] }]);
await egal('code inconnu : aucune version', lignes(en(null, `select * from public.releases_by_barcode($1)`, [ean13('500000000003')])), []);
await ko('qui a ajouté le code reste privé', en(null, `select added_by from public.release_barcode`), 'permission denied');
await egal('l\'ajout est dans l\'historique du jeu', val(`select action, changed_by from public.catalog_change where table_name = 'release_barcode' and game_id = $1`, [jeu]), [{ action: 'insert', changed_by: SIMPLE }]);
await ok('un membre ne peut pas retirer un code (sans effet)', en(SIMPLE, `delete from public.release_barcode where release_id = $1`, [ff7fr]));
await egal('…le code est toujours là', val(`select count(*)::int as n from public.release_barcode where release_id = $1`, [ff7fr]), [{ n: 1 }]);
const ajoutCode = (await val(`select id from public.catalog_change where table_name = 'release_barcode' and game_id = $1`, [jeu]))[0].id;
await ok('un modérateur annule l\'ajout (code faux)', en(ADMIN, `select public.undo_catalog_change($1)`, [ajoutCode]));
await egal('…le code ne mène plus nulle part', lignes(en(null, `select * from public.releases_by_barcode('4006381333931')`)), []);
await ok('le modérateur peut l\'associer à la bonne version', en(ADMIN, `select public.add_release_barcode($1, $2)`, [ff7platinum, '4006381333931']));
let limite = (await val(`select count(*)::int as n from public.release_barcode where added_by = $1`, [SIMPLE]))[0].n;
for (let i = 0; limite < 100; i++, limite++) await en(SIMPLE, `select public.add_release_barcode($1, $2)`, [ff7fr, ean13(String(600000000000 + i))]);
await ko('101e code de la journée : refusé', en(SIMPLE, `select public.add_release_barcode($1, $2)`, [ff7fr, ean13('700000000000')]), 'Limite atteinte');
await ok('nettoyage des codes de test', db.query(`delete from public.release_barcode where release_id = $1`, [ff7fr]));

console.log('\nCollections publiques : seules les colonnes sûres');
const pseudo = (await val(`select username from public.profile where id = $1`, [MEMBRE]))[0].username;
await ok('la collection du membre est publique', db.query(`update public.profile set public_collection = true where id = $1`, [MEMBRE]));
await egal('un visiteur ne lit aucune ligne de la table des collections', lignes(en(null, `select count(*)::int as n from public.collection_item`)), [{ n: 0 }]);
await egal('un autre membre non plus (prix, lieux, notes restent privés)', lignes(en(AUTRE, `select count(*)::int as n from public.collection_item where profile_id = $1`, [MEMBRE])), [{ n: 0 }]);
await egal('la page publique montre ses exemplaires', lignes(en(null, `select count(*)::int as n from public.public_collection($1)`, [pseudo])).then((r) => r[0].n > 0), true);
await ko('…sans le prix payé', en(null, `select purchase_price from public.public_collection($1)`, [pseudo]), 'does not exist');
await ko('…ni les notes', en(null, `select notes from public.public_collection($1)`, [pseudo]), 'does not exist');
await egal('…pseudo trouvé quelle que soit la casse', lignes(en(null, `select count(*)::int as n from public.public_collection($1)`, [pseudo.toUpperCase()])).then((r) => r[0].n > 0), true);
await egal('…avec la jaquette et l\'état', lignes(en(null, `select local_title, zone, condition from public.public_collection($1) where release_id = $2 limit 1`, [pseudo, ff7fr])),
  [{ local_title: 'Final Fantasy VII', zone: 'PAL', condition: 'good' }]);
await egal('profil public : ses chiffres', lignes(en(null, `select is_public, is_me, owned_games >= 1 as a, owned_copies >= 2 as b from public.public_profile($1)`, [pseudo])),
  [{ is_public: true, is_me: false, a: true, b: true }]);
await egal('…« c\'est moi » pour le propriétaire', lignes(en(MEMBRE, `select is_me from public.public_profile($1)`, [pseudo])), [{ is_me: true }]);
await ok('la collection redevient privée', db.query(`update public.profile set public_collection = false where id = $1`, [MEMBRE]));
await egal('collection privée : page publique vide', lignes(en(null, `select count(*)::int as n from public.public_collection($1)`, [pseudo])), [{ n: 0 }]);
await egal('…le profil existe, sans aucun chiffre', lignes(en(AUTRE, `select is_public, owned_games, wanted_games from public.public_profile($1)`, [pseudo])),
  [{ is_public: false, owned_games: null, wanted_games: null }]);
await egal('…son propriétaire voit quand même sa page', lignes(en(MEMBRE, `select count(*)::int as n from public.public_collection($1)`, [pseudo])).then((r) => r[0].n > 0), true);
await egal('membre inconnu : rien', lignes(en(null, `select * from public.public_profile('personne_ici')`)), []);
await ok('la collection redevient publique', db.query(`update public.profile set public_collection = true where id = $1`, [MEMBRE]));

console.log('\nSéries : catalogue filtré, résumé, progression');
const serie = (await en(ADMIN, `insert into public.series (name) values ('Série Test') returning id`)).rows[0].id;
await ok('FF7 de test dans la série', en(ADMIN, `insert into public.game_series (game_id, series_id) values ($1, $2)`, [jeu, serie]));
await ok('…et un autre jeu PAL', en(ADMIN, `insert into public.game_series (game_id, series_id) values ($1, $2)`, [unAutrePal.game_id, serie]));
await egal('catalogue filtré par série : les deux jeux', catalogue(null, { zone: 'PAL', series: serie }).then((r) => r.map((x) => x.id).sort()), [jeu, unAutrePal.game_id].sort());
await egal('résumé de la série sur PS1 : 2 jeux', lignes(en(null, `select name, games from public.series_summary($1, 'PS1')`, [serie])), [{ name: 'Série Test', games: 2 }]);
await egal('progression du membre dans la série (PAL) : 1 sur 2', lignes(en(MEMBRE, `select total, owned from public.collection_series_progress('PS1', 'PAL') where series_id = $1`, [serie])), [{ total: 2, owned: 1 }]);
await egal('un visiteur : aucune série commencée', lignes(en(null, `select count(*)::int as n from public.collection_series_progress('PS1', 'PAL')`)), [{ n: 0 }]);

console.log('\nNombre de membres par jeu (totaux seulement)');
const proprietaires = (await val(`select count(distinct c.profile_id)::int as n from public.collection_item c join public.release r on r.id = c.release_id where r.game_id = $1 and c.status = 'owned'`, [jeu]))[0].n;
await egal('total du jeu : membres différents qui le possèdent (un visiteur peut le lire)', lignes(en(null, `select owners from public.game_popularity($1) where release_id is null`, [jeu])), [{ owners: proprietaires }]);
await egal('une ligne par version, plus le total', lignes(en(null, `select count(*)::int as n from public.game_popularity($1)`, [jeu])).then((r) => r[0].n),
  (await val(`select count(*)::int + 1 as n from public.release where game_id = $1`, [jeu]))[0].n);
await ko('jamais l\'identité des membres', en(null, `select profile_id from public.game_popularity($1)`, [jeu]), 'does not exist');

console.log('\nPays de la boîte (même disque, boîtes différentes selon le pays)');
const regionFr = (await val(`select id from public.region where code = 'FR'`))[0].id;
await ko('un membre ne peut pas changer le pays de la boîte', en(MEMBRE, `update public.release set box_region_id = $1 where id = $2 returning id`, [regionFr, ff7platinum]).then((r) => { if (!r.rows.length) throw new Error('row-level security : aucune ligne'); }), 'row-level security');
await ok('un modérateur indique « boîte vendue en France »', en(ADMIN, `update public.release set box_region_id = $1 where id = $2`, [regionFr, ff7platinum]));
await egal('le catalogue donne le pays de la boîte de chaque version', catalogue(null, { zone: 'PAL', search: 'final fantasy vii' })
  .then((r) => ff7(r)?.releases.find((x) => x.id === ff7platinum)?.box_country), 'FR');
await egal('…dans l\'historique du jeu', val(`select new_values ->> 'box_region_id' as v from public.catalog_change where table_name = 'release' and row_key = $1 and action = 'update' order by id desc limit 1`, [String(ff7platinum)]), [{ v: String(regionFr) }]);
const pBoite = await soumettre({ game: { title: 'Jeu Boîte Allemande' }, release: { ...versionPAL, local_title: 'Jeu Boîte Allemande', box_region_code: 'DE' }, no_cover: true });
const rBoite = (await ok('une proposition peut préciser le pays de la boîte', traiter(ADMIN, pBoite, true))).rows[0].r;
await egal('…la version créée a sa boîte allemande', val(`select rg.code from public.release r join public.region rg on rg.id = r.box_region_id where r.id = $1`, [rBoite.release_id]), [{ code: 'DE' }]);

console.log('\nFusion de deux versions (doublon)');
const garder = (await en(ADMIN, `insert into public.release (game_id, platform_id, zone, local_title, edition_type, edition_name) values ($1, $2, 'PAL', 'FF7 Platinum A', 'reissue', 'Platinum') returning id`, [jeu, ps1])).rows[0].id;
const doublonV = (await en(ADMIN, `insert into public.release (game_id, platform_id, zone, local_title, edition_type, edition_name) values ($1, $2, 'PAL', 'FF7 Platinum B', 'reissue', 'Platinum') returning id`, [jeu, ps1])).rows[0].id;
await ok('un exemplaire du membre sur le doublon', en(MEMBRE, `insert into public.collection_item (release_id, status) values ($1, 'owned')`, [doublonV]));
await ok('…un code-barres sur le doublon', db.query(`insert into public.release_barcode (barcode, release_id) values ('4006381333931', $1)`, [doublonV]));
await ok('…et une date', db.query(`insert into public.release_region (release_id, region_id) values ($1, $2)`, [doublonV, regionFr]));
await ko('fusion interne : fermée à l\'API', en(ADMIN, `select private.merge_releases($1, $2)`, [garder, doublonV]), 'permission denied');
const autreVersion = (await val(`select id from public.release where game_id <> $1 order by id limit 1`, [jeu]))[0].id;
await ko('fusion de versions de deux jeux différents : refusée', db.query(`select private.merge_releases($1, $2)`, [garder, autreVersion]), 'même jeu');
await ok('fusion du doublon dans la version gardée', db.query(`select private.merge_releases($1, $2)`, [garder, doublonV]));
await egal('…le doublon a disparu', val(`select count(*)::int as n from public.release where id = $1`, [doublonV]), [{ n: 0 }]);
await egal('…l\'exemplaire du membre suit', val(`select count(*)::int as n from public.collection_item where release_id = $1`, [garder]), [{ n: 1 }]);
await egal('…le code-barres et la date aussi', val(`select (select count(*)::int from public.release_barcode where release_id = $1) as codes, (select count(*)::int from public.release_region where release_id = $1) as dates`, [garder]), [{ codes: 1, dates: 1 }]);
await ok('nettoyage (exemplaire)', db.query(`delete from public.collection_item where release_id = $1`, [garder]));
await ok('nettoyage (version)', db.query(`delete from public.release where id = $1`, [garder]));

console.log('\nPrix médian selon l\'état (totaux seulement, jamais le prix d\'un membre)');
const vPrix = (await ok('une version pour les prix', en(ADMIN, `insert into public.release (game_id, platform_id, zone, local_title, edition_type) values ($1, $2, 'PAL', 'FF7 Prix', 'standard') returning id`, [jeu, ps1]))).rows[0].id;
// Six membres de plus, réservés à ces tests (les identifiants …a à …e servent ailleurs)
const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((_, i) => `00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`);
for (const [i, id] of P.entries()) await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, $2)`, [id, { username: `Acheteur${i + 1}` }]);
// Un exemplaire acheté : complet d'occasion par défaut
const achat = (uid, prixPaye, champs = {}) => {
  const c = { condition: 'very_good', acquisition: 'used', has_box: true, has_manual: true, has_media: true, purchase_date: null, ...champs };
  return en(uid, `insert into public.collection_item (release_id, status, condition, acquisition, has_box, has_manual, has_media, purchase_price, purchase_date)
    values ($1, 'owned', $2, $3, $4, $5, $6, $7, $8)`, [vPrix, c.condition, c.acquisition, c.has_box, c.has_manual, c.has_media, prixPaye, c.purchase_date]);
};
// Les uns après les autres : en() change le rôle de l'unique connexion
const suite = async (...appels) => { for (const appel of appels) await appel(); };
const prix = (uid = null) => lignes(en(uid, `select category, members, median::float8 as median, low::float8 as low, high::float8 as high
  from public.release_prices($1) where release_id = $2 order by category`, [jeu, vPrix]));
await ok('quatre membres notent le prix de leur exemplaire complet', suite(() => achat(ADMIN, 20), () => achat(MEMBRE, 10), () => achat(AUTRE, 30), () => achat(P[0], 15)));
await egal('à 4 membres : le nombre seulement, pas de médiane', prix(), [{ category: 'complete', members: 4, median: null, low: null, high: null }]);
await ok('un cinquième membre', achat(P[1], 25));
await ok('le deuxième membre note un second exemplaire (30 €)', achat(MEMBRE, 30));
await egal('à 5 membres : la médiane (un membre compte une fois, moyenne de ses exemplaires)', prix(), [{ category: 'complete', members: 5, median: 20, low: null, high: null }]);
await ok('ne comptent pas : un cadeau, un prix à 0 €, un achat d\'il y a 10 ans, un exemplaire au contenu non précisé', suite(
  () => achat(P[2], 100, { acquisition: 'gift' }),
  () => achat(P[3], 0),
  () => achat(P[4], 90, { purchase_date: '2016-05-01' }),
  () => achat(P[5], 80, { has_box: null, has_manual: null, has_media: null, condition: null }),
));
await egal('…la médiane ne bouge pas', prix(), [{ category: 'complete', members: 5, median: 20, low: null, high: null }]);
await ok('trois autres membres (8 en tout)', suite(() => achat(P[2], 40), () => achat(P[3], 35), () => achat(P[4], 12)));
await egal('à 8 membres : médiane et fourchette, arrondies à l\'euro (12 15 20 20 25 30 35 40)', prix(), [{ category: 'complete', members: 8, median: 23, low: 19, high: 31 }]);
await ok('disque seul, acheté neuf (ouvert depuis), neuf sous blister d\'occasion', suite(
  () => achat(P[0], 5, { has_box: false, has_manual: false }),
  () => achat(P[1], 60, { acquisition: 'new', condition: 'like_new' }),
  () => achat(P[5], 50, { condition: 'sealed' }),
));
await egal('chaque état a ses propres prix', prix().then((r) => r.map((x) => `${x.category}:${x.members}`)), ['complete:8', 'loose:1', 'new:2']);
await egal('un visiteur peut lire les prix (totaux seulement)', prix(null).then((r) => r.length), 3);
await ko('jamais l\'identité des membres', en(null, `select profile_id from public.release_prices($1)`, [jeu]), 'does not exist');
await ko('les vues internes sont fermées à l\'API', en(MEMBRE, `select * from private.member_price`), 'permission denied');
await ko('le calcul de l\'état est fermé à l\'API', en(MEMBRE, `select private.price_category('sealed', 'used', true, true, true, true)`), 'permission denied');
const estimation = (uid) => lignes(en(uid, `select category, median::float8 as median from public.my_collection_prices() order by item_id`));
await egal('ma collection : chacun de mes exemplaires avec le prix médian de son état', estimation(MEMBRE), [{ category: 'complete', median: 23 }, { category: 'complete', median: 23 }]);
await egal('…état actuel : l\'exemplaire acheté neuf puis ouvert compte comme complet', estimation(P[1]), [{ category: 'complete', median: 23 }, { category: 'complete', median: 23 }]);
await egal('…pas d\'estimation sous 5 membres (disque seul)', estimation(P[0]), [{ category: 'complete', median: 23 }]);
await ko('…réservé aux membres connectés', en(null, `select * from public.my_collection_prices()`), 'permission denied');
await ok('nettoyage (exemplaires et version des prix)', db.query(`delete from public.collection_item where release_id = $1`, [vPrix]).then(() => db.query(`delete from public.release where id = $1`, [vPrix])));

console.log('\nTrophées de collection (compteurs du membre, jamais ceux d\'une collection privée)');
const T = P[0]; // Acheteur1 : plus aucun exemplaire après les tests de prix
const stats = (uid, member = null) => lignes(en(uid, `select * from public.trophy_stats($1)`, [member]));
await egal('collection vide : une ligne, tout à zéro', stats(T).then((r) => [r.length, r[0].owned_games, r[0].best_share]), [1, 0, '0']);
const [pal1, pal2, pal3] = await val(`select r.id, r.game_id from public.release r join public.platform pl on pl.id = r.platform_id
  where pl.short_name = 'PS1' and r.zone = 'PAL' and r.edition_type = 'standard'
  and r.game_id in (select game_id from public.release group by game_id having count(*) = 1) order by r.id limit 3`);
const reedition = (await val(`select id, game_id from public.release where zone = 'PAL' and edition_type = 'reissue' order by id limit 1`))[0];
const japon = (await val(`select id, game_id from public.release where zone = 'NTSC-J' order by id limit 1`))[0];
const recherche = (await val(`select id from public.release where zone = 'NTSC-U' order by id limit 1`))[0];
const exemplaire = (uid, release, champs) => en(uid, `insert into public.collection_item (release_id, status, condition, has_box, has_manual, has_media, purchase_price, trade_status)
  values ($1, $2, $3, $4, $5, $6, $7, $8)`, [release, champs.status ?? 'owned', champs.condition ?? null, champs.box ?? null, champs.manual ?? null, champs.media ?? null, champs.price ?? null, champs.trade ?? null]);
await ok('un exemplaire complet avec son prix, une réédition sous blister, un import japonais à échanger, un jeu recherché', (async () => {
  await exemplaire(T, pal1.id, { condition: 'very_good', box: true, manual: true, media: true, price: 12 });
  await exemplaire(T, reedition.id, { condition: 'sealed' });
  await exemplaire(T, japon.id, { trade: 'for_trade' });
  await exemplaire(T, recherche.id, { status: 'wanted' });
})());
const jeux = new Set([pal1.game_id, reedition.game_id, japon.game_id]).size;
await egal('les compteurs', stats(T).then((r) => {
  const s = r[0];
  return [s.owned_games, s.complete_copies, s.sealed_copies, s.priced_copies, s.reissue_copies, s.japan_games, s.zones, s.consoles, s.wanted_games, s.offered_copies];
}), [jeux, 1, 1, 1, 1, 1, 2, 1, 1, 1]);
await egal('la meilleure part du catalogue est celle de la PS1 (une console, une zone)', stats(T).then((r) => [r[0].best_share_platform, Number(r[0].best_share) > 0]), ['PS1', true]);
await egal('collection privée : un visiteur ne voit rien', stats(null, 'Acheteur1').then((r) => r.length), 0);
await egal('…un autre membre non plus', stats(MEMBRE, 'acheteur1').then((r) => r.length), 0);
await egal('…le membre lui-même, oui (par son pseudo aussi)', stats(T, 'Acheteur1').then((r) => r.length), 1);
await egal('sans pseudo ni connexion : rien', stats(null).then((r) => r.length), 0);
await ok('le membre rend sa collection publique', en(T, `update public.profile set public_collection = true where id = $1`, [T]));
await egal('…un visiteur voit ses compteurs', stats(null, 'acheteur1').then((r) => r[0]?.owned_games), jeux);
const serieTrophees = (await ok('une série de trois jeux', en(ADMIN, `insert into public.series (name) values ('Série des trophées') returning id`))).rows[0].id;
await ok('…dont il possède les trois', (async () => {
  for (const g of [pal1, pal2, pal3]) await en(ADMIN, `insert into public.game_series (game_id, series_id) values ($1, $2)`, [g.game_id, serieTrophees]);
  await exemplaire(T, pal2.id, {});
  await exemplaire(T, pal3.id, {});
})());
await egal('…série complète', stats(T).then((r) => r[0].complete_series), 1);
await ok('un code-barres associé par le membre', db.query(`insert into public.release_barcode (barcode, release_id, added_by) values ('4006381333931', $1, $2)`, [pal1.id, T]));
await egal('…compté', stats(T).then((r) => r[0].barcodes), 1);
await ok('nettoyage (trophées)', (async () => {
  await db.query(`delete from public.release_barcode where added_by = $1`, [T]);
  await db.query(`delete from public.game_series where series_id = $1`, [serieTrophees]);
  await db.query(`delete from public.series where id = $1`, [serieTrophees]);
  await db.query(`delete from public.collection_item where profile_id = $1`, [T]);
  await db.query(`update public.profile set public_collection = false where id = $1`, [T]);
})());

console.log('\nJaquette proposée pour une version existante (validée par un modérateur)');
const vJaq = (await val(`select r.id, r.game_id from public.release r where not exists (select 1 from public.image i where i.release_id = r.id) order by r.id limit 1`))[0];
const deposer = (uid, fichier) => en(uid, `insert into storage.objects (bucket_id, name) values ('submission-images', $1)`, [fichier]);
const proposerJaquette = async (uid, release, fichier) => (await en(uid, `insert into public.submission (action, target, target_id, data)
  values ('create', 'image', $1, $2::jsonb) returning id`, [release, JSON.stringify({ cover_path: fichier })])).rows[0].id;
await ko('sans image : refusée', en(MEMBRE, `insert into public.submission (action, target, target_id, data) values ('create', 'image', $1, '{}')`, [vJaq.id]), 'submission_cover_for_release');
await ko('image annoncée mais pas envoyée : refusée', proposerJaquette(MEMBRE, vJaq.id, `${MEMBRE}/jaq-absente.webp`), 'introuvable');
await ok('le membre dépose sa photo recadrée', deposer(MEMBRE, `${MEMBRE}/jaq-a.webp`));
await ko('pour une version qui n\'existe pas : refusée', proposerJaquette(MEMBRE, 999999999, `${MEMBRE}/jaq-a.webp`), 'existe plus');
await ko('l\'image d\'un autre membre : refusée (il ne la voit même pas)', (async () => {
  await deposer(AUTRE, `${AUTRE}/jaq-x.webp`);
  return proposerJaquette(MEMBRE, vJaq.id, `${AUTRE}/jaq-x.webp`);
})(), 'introuvable');
const pJaq = await ok('le membre propose la jaquette de la version', proposerJaquette(MEMBRE, vJaq.id, `${MEMBRE}/jaq-a.webp`));
await ko('une seule jaquette en attente par version et par membre', proposerJaquette(MEMBRE, vJaq.id, `${MEMBRE}/jaq-a.webp`), 'déjà proposé');
await ko('un membre ne peut pas la valider', traiter(MEMBRE, pJaq, true, null, 'submissions/jaq-1.webp'), 'Seuls les modérateurs');
await ko('validation sans copie publique : refusée', traiter(ADMIN, pJaq, true), 'copiée');
await ok('le modérateur copie l\'image dans les jaquettes publiques', en(ADMIN, `insert into storage.objects (bucket_id, name) values ('covers', 'submissions/jaq-1.webp')`));
await egal('acceptée : rien à remplacer', traiter(ADMIN, pJaq, true, null, 'submissions/jaq-1.webp').then((r) => r.rows[0].r.replaced), []);
await egal('…la version a sa jaquette, créditée au membre', val(`select path, uploaded_by from public.image where release_id = $1 and type = 'front'`, [vJaq.id]),
  [{ path: 'submissions/jaq-1.webp', uploaded_by: MEMBRE }]);
await egal('…la proposition pointe vers la version', val(`select status, created_release_id, created_game_id from public.submission where id = $1`, [pJaq]),
  [{ status: 'approved', created_release_id: vJaq.id, created_game_id: vJaq.game_id }]);
await ok('un meilleur scan, proposé ensuite', deposer(MEMBRE, `${MEMBRE}/jaq-b.webp`));
const pJaq2 = await ok('…pour la même version (la précédente n\'attend plus)', proposerJaquette(MEMBRE, vJaq.id, `${MEMBRE}/jaq-b.webp`));
await ok('…copiée par le modérateur', en(ADMIN, `insert into storage.objects (bucket_id, name) values ('covers', 'submissions/jaq-2.webp')`));
await egal('acceptée : elle remplace l\'ancienne, dont le chemin est rendu pour retirer le fichier', traiter(ADMIN, pJaq2, true, null, 'submissions/jaq-2.webp').then((r) => r.rows[0].r.replaced), ['submissions/jaq-1.webp']);
await egal('…une seule jaquette pour la version', val(`select path from public.image where release_id = $1 and type = 'front'`, [vJaq.id]), [{ path: 'submissions/jaq-2.webp' }]);
await ok('un autre membre propose une image floue', (async () => { await deposer(AUTRE, `${AUTRE}/jaq-floue.webp`); })());
const pFloue = (await en(AUTRE, `insert into public.submission (action, target, target_id, data) values ('create', 'image', $1, $2::jsonb) returning id`,
  [vJaq.id, JSON.stringify({ cover_path: `${AUTRE}/jaq-floue.webp` })])).rows[0].id;
await ko('refus sans motif : impossible', traiter(ADMIN, pFloue, false), 'motif');
await ok('refus avec motif', traiter(ADMIN, pFloue, false, 'Image floue'));
await egal('…la jaquette en place ne change pas', val(`select path from public.image where release_id = $1 and type = 'front'`, [vJaq.id]), [{ path: 'submissions/jaq-2.webp' }]);
await ok('nettoyage (jaquettes proposées)', db.query(`delete from public.image where release_id = $1`, [vJaq.id]));

console.log('\nNavigateurs de confiance et passkeys (double authentification sans code)');
const C = P[1]; // Acheteur2
const sess = () => crypto.randomUUID();
const comme = (uid, session, sql, params = [], aal = 'aal1', amr) => en(uid, sql, params, aal, { session_id: session, ...(amr ? { amr } : {}) });
const mfa = (session, aal = 'aal1', amr) => lignes(comme(C, session, `select private.mfa_satisfied() as ok`, [], aal, amr)).then((r) => r[0].ok);
const confier = async (uid, label) => (await comme(uid, sess(), `select public.trust_this_browser($1) as t`, [label], 'aal2')).rows[0].t;
const presenter = (uid, session, jeton) => lignes(comme(uid, session, `select public.use_trusted_browser($1) as ok`, [jeton])).then((r) => r[0].ok);

await ok('le membre active la double authentification', db.query(`insert into auth.mfa_factors (user_id, status, created_at) values ($1, 'verified', now() - interval '1 minute')`, [C]));
const s1 = sess();
await egal('connexion par mot de passe seul : double authentification non satisfaite', mfa(s1), false);
await ko('pas de confiance sans avoir tapé le code', comme(C, s1, `select public.trust_this_browser('Firefox')`), 'Valide d');
const jeton = await ok('après le code (aal2), ce navigateur devient de confiance', confier(C, 'Firefox sur Windows'));
await egal('…jeton long et aléatoire', jeton.length >= 60, true);
await egal('…seule son empreinte est gardée', val(`select count(*)::int as n from private.trusted_browser where token_hash = $1`, [jeton]), [{ n: 0 }]);
const s3 = sess();
await egal('nouvelle connexion par mot de passe : un faux jeton ne sert à rien', presenter(C, s3, 'faux'), false);
await egal('…le vrai jeton reconnaît la session', presenter(C, s3, jeton), true);
await egal('…qui satisfait la double authentification', mfa(s3), true);
await egal('…mais pas une autre session du même membre', mfa(sess()), false);
await egal('le jeton d\'un membre ne sert pas à un autre', presenter(MEMBRE, sess(), jeton), false);
await ko('pas de confiance en chaîne : une session reconnue ne crée pas d\'autre navigateur de confiance', comme(C, s3, `select public.trust_this_browser('x')`), 'Valide d');
await egal('Mon compte : le navigateur listé, signalé comme celui-ci', lignes(comme(C, s3, `select label, is_current from public.my_trusted_browsers()`)),
  [{ label: 'Firefox sur Windows', is_current: true }]);
await ko('les tables sont fermées à l\'API', comme(C, s3, `select * from private.trusted_browser`), 'permission denied');

await ok('30 jours plus tard (expiration simulée)', db.query(`update private.trusted_browser set expires_at = now() - interval '1 second' where user_id = $1`, [C]));
await egal('…la session reconnue ne l\'est plus', mfa(s3), false);
await egal('…le jeton est refusé', presenter(C, sess(), jeton), false);

const s4 = sess();
const jeton2 = await confier(C, 'Chrome sur Android');
await egal('un nouveau navigateur de confiance', presenter(C, s4, jeton2).then(() => mfa(s4)), true);
const id2 = (await lignes(comme(C, s4, `select id from public.my_trusted_browsers()`)))[0].id;
await ok('retiré depuis Mon compte', comme(C, s4, `select public.revoke_trusted_browser($1)`, [id2]));
await egal('…la session n\'est plus reconnue', mfa(s4), false);

const s5 = sess();
await presenter(C, s5, await confier(C, 'Safari sur iPhone'));
await egal('avant changement de mot de passe : reconnue', mfa(s5), true);
await ok('le mot de passe change', db.query(`update auth.users set encrypted_password = 'nouveau' where id = $1`, [C]));
await egal('…plus aucun navigateur de confiance', val(`select count(*)::int as n from private.trusted_browser where user_id = $1`, [C]), [{ n: 0 }]);
await egal('…la session n\'est plus reconnue', mfa(s5), false);

const s6 = sess();
await presenter(C, s6, await confier(C, 'Edge sur Windows'));
await egal('double authentification désactivée puis réactivée : avant, reconnue', mfa(s6), true);
await ok('…nouvelle activation (nouveau facteur)', db.query(`delete from auth.mfa_factors where user_id = $1`, [C])
  .then(() => db.query(`insert into auth.mfa_factors (user_id, status, created_at) values ($1, 'verified', now() + interval '1 second')`, [C])));
await egal('…les anciens navigateurs de confiance ne valent plus', mfa(s6), false);

await confier(C, 'A'); await confier(C, 'B');
await ok('« Se déconnecter de tous les appareils » : tous retirés', comme(C, sess(), `select public.revoke_trusted_browsers()`));
await egal('…aucun ne reste', val(`select count(*)::int as n from private.trusted_browser where user_id = $1`, [C]), [{ n: 0 }]);

await egal('connexion par passkey : pas de code', mfa(sess(), 'aal1', [{ method: 'passkey', timestamp: 1 }]), true);
await egal('…mot de passe seul : code demandé', mfa(sess(), 'aal1', [{ method: 'password', timestamp: 1 }]), false);

const sA = sess();
await presenter(ADMIN, sA, await confier(ADMIN, 'Admin'));
await ok('un modérateur reconnu par son navigateur de confiance peut modifier le catalogue', comme(ADMIN, sA, `insert into public.genre (name) values ('Genre de confiance')`));
await ko('…sans navigateur de confiance ni code : non', comme(ADMIN, sess(), `insert into public.genre (name) values ('Genre sans confiance')`), 'row-level security');
await ok('nettoyage (confiance)', (async () => {
  await db.query(`delete from public.genre where name = 'Genre de confiance'`);
  await db.query(`delete from private.trusted_browser`);
  await db.query(`delete from auth.mfa_factors where user_id = $1`, [C]);
})());

console.log('\nAdresses lisibles des fiches (/jeu/ps1/final-fantasy-vii)');
await egal('texte → adresse : minuscules, sans accents ni ponctuation', val(`select public.slugify('Pokémon : Édition Jaune !') as a, public.slugify('Final Fantasy VII') as b, public.slugify('超謎王') as c`),
  [{ a: 'pokemon-edition-jaune', b: 'final-fantasy-vii', c: '' }]);
await egal('chaque jeu importé (avec une version) a son adresse', val(`select count(*)::int as n from public.game g where g.slug is null and exists (select 1 from public.release r where r.game_id = g.id)`), [{ n: 0 }]);
await egal('…toutes différentes', val(`select count(*)::int - count(distinct slug)::int as n from public.game where slug is not null`), [{ n: 0 }]);
await egal('…la console en tête : ps1/… ou ps2/…', val(`select count(*)::int as n from public.game where slug is not null and slug !~ '^(ps1|ps2)/'`), [{ n: 0 }]);
const jeuAdresse = async (title, date = null) => (await en(ADMIN, `insert into public.game (title, first_release_date, first_release_precision) values ($1, $2, $3) returning id`, [title, date, date ? 'day' : null])).rows[0].id;
const versionAdresse = (game, platform, code = null) => en(ADMIN, `insert into public.release (game_id, platform_id, zone, local_title, edition_type, product_code) values ($1, $2, 'PAL', 'x', 'standard', $3)`, [game, platform, code]);
const adresseDe = async (game) => (await val(`select slug from public.game where id = $1`, [game]))[0].slug;
const jA = await jeuAdresse('Jeu Adresse Témoin', '2001-05-01');
await egal('nouveau jeu sans version : pas encore d\'adresse (pas de console)', adresseDe(jA), null);
await ok('…sa première version (PS2)', versionAdresse(jA, ps2));
await egal('…il reçoit son adresse', adresseDe(jA), 'ps2/jeu-adresse-temoin');
const jB = await jeuAdresse('Jeu Adresse Témoin', '2003-02-01');
await versionAdresse(jB, ps2);
await egal('même titre, même console : l\'année le distingue', adresseDe(jB), 'ps2/jeu-adresse-temoin-2003');
const jC = await jeuAdresse('Jeu Adresse Témoin', '2003-09-01');
await versionAdresse(jC, ps2);
await egal('…même année aussi : un numéro en plus', adresseDe(jC), 'ps2/jeu-adresse-temoin-2003-2');
const jD = await jeuAdresse('Jeu Adresse Témoin');
await versionAdresse(jD, ps1);
await egal('autre console : pas de conflit', adresseDe(jD), 'ps1/jeu-adresse-temoin');
await egal('une deuxième version ne change pas l\'adresse', versionAdresse(jA, ps1).then(() => adresseDe(jA)), 'ps2/jeu-adresse-temoin');
const jeuParAdresse = (uid, path) => lignes(en(uid, `select public.game_id_by_slug($1) as id`, [path])).then((r) => r[0].id);
await egal('un visiteur retrouve le jeu par son adresse', jeuParAdresse(null, 'ps2/jeu-adresse-temoin-2003'), jB);
await egal('…en majuscules aussi', jeuParAdresse(null, 'PS2/Jeu-Adresse-Temoin-2003'), jB);
await egal('adresse inconnue : rien', jeuParAdresse(null, 'ps1/nexiste-pas'), null);
await ok('le titre est corrigé', en(ADMIN, `update public.game set title = 'Jeu Adresse Renommé' where id = $1`, [jA]));
await egal('…nouvelle adresse', adresseDe(jA), 'ps2/jeu-adresse-renomme');
await egal('…l\'ancienne mène toujours au jeu', jeuParAdresse(null, 'ps2/jeu-adresse-temoin'), jA);
await egal('…et la nouvelle aussi', jeuParAdresse(null, 'ps2/jeu-adresse-renomme'), jA);
await ok('retour au titre d\'origine', en(ADMIN, `update public.game set title = 'Jeu Adresse Témoin' where id = $1`, [jA]));
await egal('…l\'adresse d\'origine revient', adresseDe(jA), 'ps2/jeu-adresse-temoin');
await egal('…sans doublon dans l\'historique', val(`select count(*)::int as n from public.game_slug_history where slug = 'ps2/jeu-adresse-temoin'`), [{ n: 0 }]);
await egal('changer une autre information ne touche pas l\'adresse', en(ADMIN, `update public.game set summary = 'Résumé' where id = $1`, [jB]).then(() => adresseDe(jB)), 'ps2/jeu-adresse-temoin-2003');
const jJ = await jeuAdresse('超謎王テスト');
await versionAdresse(jJ, ps1, 'SLPS-99999');
await egal('titre sans lettres latines : le code produit', adresseDe(jJ), 'ps1/slps-99999');
await ok('…un modérateur lui donne un titre en lettres latines pour l’adresse', en(ADMIN, `update public.game set slug_title = 'Chou Nazo Ou Test' where id = $1`, [jJ]));
await egal('…nouvelle adresse lisible', adresseDe(jJ), 'ps1/chou-nazo-ou-test');
await egal('…l’ancienne (code produit) mène toujours au jeu', jeuParAdresse(null, 'ps1/slps-99999'), jJ);
await ok('fusion : le troisième jeu rejoint le premier', en(ADMIN, `select public.merge_games($1, $2)`, [jA, jC]));
await egal('…l\'adresse du jeu fusionné mène au jeu gardé', jeuParAdresse(null, 'ps2/jeu-adresse-temoin-2003-2'), jA);
await egal('les listes du site donnent l\'adresse : catalogue', catalogue(null, { console: 'PS2', search: 'jeu adresse temoin', size: 10 }).then((r) => r.map((x) => x.slug).sort()),
  ['ps2/jeu-adresse-temoin', 'ps2/jeu-adresse-temoin-2003']);
await egal('…recherche', lignes(en(null, `select slug from public.search_games('jeu adresse temoin', 10) order by slug`)).then((r) => r.map((x) => x.slug)),
  ['ps1/jeu-adresse-temoin', 'ps2/jeu-adresse-temoin', 'ps2/jeu-adresse-temoin-2003']);
await ko('les anciennes adresses ne s\'écrivent pas par l\'API', en(MEMBRE, `insert into public.game_slug_history (slug, game_id) values ('ps1/piege', $1)`, [jA]), '');
await ko('…pas même par un modérateur', en(ADMIN, `delete from public.game_slug_history`).then((r) => { if (r.affectedRows === 0) throw new Error('refusé (aucune ligne)'); }), '');
await ok('nettoyage (adresses)', (async () => {
  for (const g of [jA, jB, jD, jJ]) {
    await db.query(`delete from public.release where game_id = $1`, [g]);
    await db.query(`delete from public.game where id = $1`, [g]);
  }
})());

console.log('\nCohérence du catalogue (imports compris)');
await egal('chaque jeu importé a au moins une sortie', val(`select count(*)::int as n from public.game g where g.wikidata_id is not null and not exists (select 1 from public.release r where r.game_id = g.id)`), [{ n: 0 }]);
await egal('chaque date de sortie est cohérente avec sa précision', val(`select count(*)::int as n from public.release_region where (release_date is null) <> (date_precision is null)`), [{ n: 0 }]);
await egal('aucune réédition vers un autre jeu', val(`select count(*)::int as n from public.release r join public.release o on o.id = r.reissue_of where o.game_id <> r.game_id`), [{ n: 0 }]);

console.log(echecs ? `\n${echecs} test(s) en échec` : '\nTous les tests passent');
process.exit(echecs ? 1 : 0);
