// Champs lus pour afficher une sortie complète (réutilisés par plusieurs pages)
export const RELEASE_FIELDS = `
  id, game_id, zone, local_title, edition_type, edition_name, product_code, media_count, languages, reissue_of,
  platform(id, short_name),
  release_region(release_date, date_precision, region(code, name)),
  release_company(role, company(name)),
  image(id, type, path)
`;

export const GAME_FIELDS = `
  id, title, summary, summary_source, first_release_date, first_release_precision,
  game_developer(company(name)),
  game_genre(genre(name)),
  release(${RELEASE_FIELDS})
`;

export const COLLECTION_FIELDS = `
  id, status, condition, has_box, has_manual, has_media, purchase_price, purchase_date, notes,
  acquisition, purchase_place, has_spine_card, trade_status,
  release:release_id(
    id, zone, local_title, edition_type, edition_name, product_code,
    platform(short_name),
    image(id, type, path),
    game(id, title, first_release_date)
  )
`;
