// =====================================================================
// Wikitexte / HTML → texte simple, pour les scripts d'import.
//
// Le site affiche toujours ces textes comme du texte (React), jamais comme du HTML ;
// ces fonctions retirent quand même tout proprement :
// - balises, commentaires et références retirés en recommençant tant qu'il en reste
//   (« <scr<b>ipt> » ou « <!-<!---->- -> » ne peuvent pas se reformer) ;
// - entités HTML décodées en une seule passe (« &amp;lt; » donne « &lt; », pas « < »).
// =====================================================================

// Retire chaque correspondance de `pattern` (expression globale) jusqu'à ce qu'il n'en reste plus
export function removeAll(text, pattern) {
  let previous;
  do {
    previous = text;
    text = text.replace(pattern, '');
  } while (text !== previous);
  return text;
}

// Retire toutes les balises, puis les chevrons restés seuls
export function stripTags(text) {
  return removeAll(text, /<[^<>]*>/g).replace(/[<>]/g, '');
}

// Références (<ref … /> et <ref>…</ref>) et commentaires (<!-- … -->)
export function stripRefsAndComments(text) {
  return removeAll(text, /<ref[^<>]*\/>|<ref[^<>]*>[\s\S]*?<\/ref>|<!--[\s\S]*?-->/gi);
}

// Entités courantes de Wikipédia, décodées en une seule passe
const ENTITIES = { nbsp: ' ', amp: '&', ndash: '–', mdash: '—' };
export function decodeEntities(text) {
  return text.replace(/&(nbsp|amp|ndash|mdash);/g, (_, name) => ENTITIES[name]);
}
