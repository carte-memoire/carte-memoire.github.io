import type { SpecField } from './types';
import { tr } from './i18n';

// Libellés des caractéristiques (platform.spec_fields, écrits en français dans la base) :
// leur traduction, pour le site en anglais. Une console ajoutée plus tard sans entrée ici
// garde simplement ses libellés français.
const SPEC_TEXT: Record<string, string> = {
  // PlayStation
  'Blocs de carte mémoire': tr('Blocs de carte mémoire'),
  'Manette analogique': tr('Manette analogique'),
  'Compatible': tr('Compatible'),
  'Requise': tr('Requise'),
  'Câble Link': tr('Câble Link'),
  'Souris': tr('Souris'),
  'GunCon': 'GunCon',
  'neGcon': 'neGcon',
  'PocketStation': 'PocketStation',
  // Communs
  'Non': tr('Non'),
  'Vibrations': tr('Vibrations'),
  'Compatible Multitap': tr('Compatible Multitap'),
  'Périphériques': tr('Périphériques'),
  'Volant': tr('Volant'),
  // PlayStation 2
  'Carte mémoire (Ko)': tr('Carte mémoire (Ko)'),
  'Commandes analogiques': tr('Commandes analogiques'),
  'Joysticks seulement': tr('Joysticks seulement'),
  'Tous les boutons': tr('Tous les boutons'),
  'Jeu en ligne': tr('Jeu en ligne'),
  'Affichage': tr('Affichage'),
  '480p (progressif)': tr('480p (progressif)'),
  'Mode 60 Hz': tr('Mode 60 Hz'),
  'Son': tr('Son'),
  'Micro-casque': tr('Micro-casque'),
  'Micro': tr('Micro'),
  'Guitare': tr('Guitare'),
  'Tapis de danse': tr('Tapis de danse'),
  'Clavier USB': tr('Clavier USB'),
  'Souris USB': tr('Souris USB'),
  'Disque dur': tr('Disque dur'),
};

export const specText = (label: string): string => SPEC_TEXT[label] ?? label;

// Caractéristiques renseignées d'une version, prêtes à afficher (« Vibrations : oui »…),
// dans l'ordre défini par la console. Les valeurs inconnues ne sont pas affichées.
export function describeSpecs(specs: Record<string, unknown> | undefined, fields: SpecField[] | undefined): { label: string; value: string }[] {
  if (!specs || !fields) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of fields) {
    const v = specs[f.key];
    if (v === undefined || v === null) continue;
    const option = (x: unknown) => specText(f.options?.find((o) => o.value === x)?.label ?? String(x));
    const label = specText(f.label);
    switch (f.type) {
      case 'integer': {
        const n = Number(v);
        const value = f.key === 'memory_card_blocks' ? tr('{0} bloc{1?s}', n, n > 1)
          : f.key === 'memory_card_kb' ? tr('{0} Ko', n)
          : String(n);
        out.push({ label, value });
        break;
      }
      case 'boolean': out.push({ label, value: v ? tr('oui') : tr('non') }); break;
      case 'choice': out.push({ label, value: option(v).toLowerCase() }); break;
      case 'multi_choice': if (Array.isArray(v) && v.length) out.push({ label, value: v.map(option).join(', ') }); break;
    }
  }
  return out;
}
