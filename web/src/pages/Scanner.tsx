import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatBarcode, LINK_PATTERN, linkChannel } from '../lib/barcode';
import type { BarcodeMatch } from '../lib/types';
import { ScanCamera } from '../components/ScanCamera';
import { ManualCode, matchLabel, useScanner } from '../components/Scanner';

interface Sent {
  code: string;
  label: string;
  ok: boolean;
}

// Le scanner sur le téléphone. Ouvert par le QR code de l'ordinateur (?lien=…) :
// chaque code lu part vers l'ordinateur, qui ouvre la fiche. Ouvert seul : la fiche
// s'ouvre ici, sur le téléphone.
export function ScannerPage() {
  const [params] = useSearchParams();
  const link = params.get('lien');
  if (link && LINK_PATTERN.test(link)) return <LinkedScanner link={link} />;
  return <StandaloneScanner />;
}

function StandaloneScanner() {
  const { handleCode } = useScanner();
  return (
    <section className="stack narrow">
      <h1>Scanner un jeu</h1>
      <div className="panel stack"><ScanCamera onCode={handleCode} /><ManualCode onCode={handleCode} /></div>
    </section>
  );
}

function LinkedScanner({ link }: { link: string }) {
  const channel = useRef<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);

  useEffect(() => {
    const ch = supabase.channel(linkChannel(link), { config: { broadcast: { self: false, ack: true }, presence: { key: crypto.randomUUID() } } });
    channel.current = ch;
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnected(true);
        // Signale sa présence à l'ordinateur (qui affiche « Téléphone relié »)
        ch.track({ device: 'phone' });
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnected(false);
      }
    });
    return () => {
      ch.untrack();
      supabase.removeChannel(ch);
      channel.current = null;
    };
  }, [link]);

  async function send(code: string) {
    const result = await channel.current?.send({ type: 'broadcast', event: 'code', payload: { code } });
    // Pour l'affichage sur le téléphone : de quel jeu s'agit-il ?
    const { data } = await supabase.rpc('releases_by_barcode', { code });
    const matches = (data as BarcodeMatch[] | null) ?? [];
    const label = matches.length === 1 ? matchLabel(matches[0])
      : matches.length > 1 ? `${matches.length} versions possibles : choix sur l'ordinateur`
      : 'Code inconnu : à identifier sur l’ordinateur';
    setSent((list) => [{ code, label, ok: result === 'ok' }, ...list].slice(0, 8));
  }

  return (
    <section className="stack narrow">
      <h1>Scanner vers l'ordinateur</h1>
      <p className={connected ? 'success' : 'notice'} aria-live="polite">
        {connected ? 'Relié à ton ordinateur : scanne les codes-barres de tes jeux, leur fiche s’ouvre là-bas.' : 'Connexion à ton ordinateur…'}
      </p>
      <div className="panel stack"><ScanCamera onCode={send} continuous /><ManualCode onCode={send} /></div>
      {sent.length > 0 && (
        <ul className="plain-list scan-sent" aria-live="polite">
          {sent.map((s, i) => (
            <li key={`${s.code}-${i}`} className="list-row">
              <span><span className="code">{formatBarcode(s.code)}</span> · {s.label}</span>
              <span className={s.ok ? 'rule-ok' : 'error small'}>{s.ok ? '✓ envoyé' : 'non reçu'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Rien n'est enregistré sur ce téléphone, et l'image de l'appareil photo n'est envoyée nulle part : seuls les chiffres du code partent vers ton ordinateur. <Link to="/">Revenir au site</Link></p>
    </section>
  );
}
