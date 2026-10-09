import { ALL_PLATFORMS } from '../lib/preferences';
import { groupByManufacturer, usePlatforms } from '../lib/usePlatforms';

// Choix de la console, glissé dans une phrase (« Tous les jeux [PlayStation ▾] ») :
// un mot souligné avec une flèche, pour qu'on comprenne qu'il se clique
export function PlatformSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const platforms = usePlatforms();
  return (
    <span className="inline-select-wrap">
      <select className="inline-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Choisir la console">
        <option value={ALL_PLATFORMS}>de toutes les consoles</option>
        {/* Tant que la liste n'est pas chargée, la console choisie reste affichée */}
        {platforms.length === 0 && value !== ALL_PLATFORMS && <option value={value}>{value === 'PS1' ? 'PlayStation' : value}</option>}
        {groupByManufacturer(platforms).map(([maker, list]) => (
          <optgroup key={maker} label={maker}>
            {list.map((p) => (
              <option key={p.short_name} value={p.short_name}>
                {p.name}{p.game_count === 0 ? ' (bientôt)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
}
