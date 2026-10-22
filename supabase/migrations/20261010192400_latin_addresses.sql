-- =====================================================================
-- Adresses des jeux au titre surtout japonais : leur titre en lettres latines
--
-- L'adresse ne gardait que les quelques lettres latines du titre :
-- « ハイスクール!奇面組 THE テーブルホッケー » avait pour adresse /jeu/ps1/the, et
-- « チョロQ2 » /jeu/ps1/q2. Google rangeait d'ailleurs la fiche de Theme Park comme
-- un doublon de /jeu/ps1/the. Leur titre romanisé (Hepburn, comme dans
-- 20261010191900_game_addresses) donne une vraie adresse ; l'ancienne passe dans
-- l'historique et y mène toujours (déclencheur assign_game_slug).
-- =====================================================================

-- Sans encombrer l'historique des modifications du catalogue (comme la première fois)
alter table public.game disable trigger log_catalog_change;
alter table public.game disable trigger set_updated_at;
update public.game g set slug_title = v.latin
from (values
  ('ザ・ゲームメーカー 売れ売れ100万本げっとだぜ!', 'The Game Maker: Ureure 100-manbon Getto da ze!'),
  ('実況パワフルプロ野球2001', 'Jikkyou Powerful Pro Yakyuu 2001'),
  ('グレイトラグビー実況''98ワールドカップへの道', 'Great Rugby Jikkyou ''98: World Cup e no Michi'),
  ('超魔神英雄伝ワタル ANOTHER STEP', 'Chou Mashin Eiyuuden Wataru: Another Step'),
  ('HASHIRIYA 狼たちの伝説', 'Hashiriya: Ookami-tachi no Densetsu'),
  ('ポポロクロイス物語II', 'Popolocrois Monogatari II'),
  ('パンドラMAXシリーズVOL.5 ごちゃちる', 'Pandora Max Series Vol. 5: Gochachiru'),
  ('チョロQ2', 'Choro Q 2'),
  ('SuperLite 1500シリーズ 魔紀行', 'SuperLite 1500 Series: Makikou'),
  ('ハイスクール!奇面組 THE テーブルホッケー', 'High School! Kimengumi: The Table Hockey')
) as v(title, latin)
where g.title = v.title and g.slug_title is null;
alter table public.game enable trigger log_catalog_change;
alter table public.game enable trigger set_updated_at;
