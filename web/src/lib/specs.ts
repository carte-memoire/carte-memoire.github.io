import type { SpecField } from './types';

// Caractéristiques renseignées d'une version, prêtes à afficher (« Vibrations : oui »…),
// dans l'ordre défini par la console. Les valeurs inconnues ne sont pas affichées.
export function describeSpecs(specs: Record<string, unknown> | undefined, fields: SpecField[] | undefined): { label: string; value: string }[] {
  if (!specs || !fields) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of fields) {
    const v = specs[f.key];
    if (v === undefined || v === null) continue;
    const option = (x: unknown) => f.options?.find((o) => o.value === x)?.label ?? String(x);
    switch (f.type) {
      case 'integer': {
        const n = Number(v);
        out.push({ label: f.label, value: f.key === 'memory_card_blocks' ? `${n} bloc${n > 1 ? 's' : ''}` : String(n) });
        break;
      }
      case 'boolean': out.push({ label: f.label, value: v ? 'oui' : 'non' }); break;
      case 'choice': out.push({ label: f.label, value: option(v).toLowerCase() }); break;
      case 'multi_choice': if (Array.isArray(v) && v.length) out.push({ label: f.label, value: v.map(option).join(', ') }); break;
    }
  }
  return out;
}
