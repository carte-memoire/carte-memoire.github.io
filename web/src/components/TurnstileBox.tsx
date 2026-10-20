import { tr } from '../lib/i18n';
import type { useTurnstile } from '../lib/turnstile';

// Emplacement du widget anti-robots (lib/turnstile.ts) : vide pour la plupart des
// visiteurs, une case à cocher pour ceux que Cloudflare juge suspects
export function TurnstileBox({ turnstile }: { turnstile: ReturnType<typeof useTurnstile> }) {
  return (
    <>
      <div ref={turnstile.container} className={turnstile.visible ? 'turnstile is-visible' : 'turnstile'} />
      {turnstile.unavailable && (
        <p className="notice small">
          {tr("La vérification anti-robots (Cloudflare) n'a pas pu se charger. Si un bloqueur de publicités est actif, autorise challenges.cloudflare.com, puis recharge la page.")}
        </p>
      )}
    </>
  );
}
