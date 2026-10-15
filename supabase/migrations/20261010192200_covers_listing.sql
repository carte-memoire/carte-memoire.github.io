-- =====================================================================
-- Jaquettes publiques : plus de liste des fichiers pour tout le monde
--
-- Signalé par le « Security Advisor » de Supabase : la règle « Covers: public
-- read » permettait à n'importe qui de lister tous les fichiers du bucket
-- covers. Inutile : un bucket public sert ses images par leur adresse publique
-- sans aucune règle. Seuls les modérateurs gardent la lecture par l'API, dont
-- ils ont besoin pour supprimer ou télécharger une jaquette (Modifier le jeu,
-- remplacement d'une jaquette).
-- =====================================================================

drop policy "Covers: public read" on storage.objects;

create policy "Covers: moderators read" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (select private.is_moderator()));
