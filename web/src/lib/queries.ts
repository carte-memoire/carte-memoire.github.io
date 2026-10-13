// Champs lus pour afficher une sortie complète (réutilisés par plusieurs pages)
export const RELEASE_FIELDS = `
  id, game_id, zone, local_title, edition_type, edition_name, product_code, media_count, languages, reissue_of,
  specs, box_region:box_region_id(code, name),
  platform(id, short_name, name, launch_date, spec_fields),
  release_region(release_date, date_precision, region(id, code, name)),
  release_company(role, company(id, name)),
  image(id, type, path)
`;

export const GAME_FIELDS = `
  id, title, summary, summary_source, first_release_date, first_release_precision,
  game_developer(company(id, name)),
  game_series(series(id, name)),
  genres_reviewed,
  game_genre(genre(id, name, families)),
  release(${RELEASE_FIELDS})
`;

export const COLLECTION_FIELDS = `
  id, status, condition, has_box, has_manual, has_media, purchase_price, purchase_date, notes,
  acquisition, purchase_place, has_spine_card, trade_status,
  release:release_id(
    id, zone, local_title, edition_type, edition_name, product_code, reissue_of, languages,
    box_region:box_region_id(code, name),
    platform(id, short_name),
    image(id, type, path),
    game(id, title, first_release_date)
  )
`;
