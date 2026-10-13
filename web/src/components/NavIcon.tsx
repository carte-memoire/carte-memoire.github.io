// Icônes du menu principal, dessinées sur la même grille que les symboles de la manette
export type NavIconName = 'search' | 'catalog' | 'collection' | 'propose' | 'moderation';

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="nav-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20.5 20.5" /></>}
      {/* Le catalogue : des boîtiers rangés */}
      {name === 'catalog' && <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>}
      {/* La collection : une carte mémoire, son étiquette et ses contacts */}
      {name === 'collection' && <><rect x="5" y="2.5" width="14" height="19" rx="1.5" /><path d="M8 6.5h8M8 10h8M9 21.5v-3.5h6v3.5" /></>}
      {name === 'propose' && <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>}
      {name === 'moderation' && <><path d="M12 3 19 6v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6Z" /><path d="m9 12 2 2 4-4" /></>}
    </svg>
  );
}
