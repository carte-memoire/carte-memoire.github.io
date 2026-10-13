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
  // Le jeu reconnu (titre, zone, édition), ou rien si le code est inconnu
  title: string;
  status: 'found' | 'several' | 'unknown';
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
  // Après chaque code : l'appareil photo s'arrête et on renvoie vers l'ordinateur
  const [step, setStep] = useState<'scanning' | 'sending' | 'done'>('scanning');

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
    setStep('sending');
    const result = await channel.current?.send({ type: 'broadcast', event: 'code', payload: { code } });
    // Pour l'affichage sur le téléphone : de quel jeu s'agit-il ?
    const { data } = await supabase.rpc('releases_by_barcode', { code });
    const matches = (data as BarcodeMatch[] | null) ?? [];
    const entry: Sent = {
      code,
      title: matches.length === 1 ? matchLabel(matches[0]) : '',
      status: matches.length === 1 ? 'found' : matches.length > 1 ? 'several' : 'unknown',
      ok: result === 'ok',
    };
    setSent((list) => [entry, ...list].slice(0, 8));
    setStep('done');
  }

  const last = sent[0];

  return (
    <section className="stack narrow">
      <h1>Scanner vers l'ordinateur</h1>
      {step === 'scanning' && (
        <>
          <p className={connected ? 'success' : 'notice'} aria-live="polite">
            {connected ? 'Relié à ton ordinateur : scanne le code-barres au dos de la boîte.' : 'Connexion à ton ordinateur…'}
          </p>
          <div className="panel stack"><ScanCamera onCode={send} /><ManualCode onCode={send} /></div>
        </>
      )}
      {step === 'sending' && <p className="loading">Envoi à ton ordinateur…</p>}
      {step === 'done' && last && (
        <div className={last.ok ? 'panel scan-done' : 'panel scan-done is-error'} role="status">
          <p className="scan-done-mark" aria-hidden="true">{last.ok ? '✓' : '!'}</p>
          {last.ok ? (
            <>
              <h2>Code envoyé : retourne sur ton ordinateur</h2>
              <p>
                {last.status === 'found' && <>La fiche de <strong>{last.title}</strong> vient de s'y ouvrir.</>}
                {last.status === 'several' && 'Plusieurs versions portent ce code : choisis la tienne sur l’ordinateur.'}
                {last.status === 'unknown' && 'Ce code n’est pas encore connu : retrouve ton jeu sur l’ordinateur pour l’associer à ta version.'}
              </p>
            </>
          ) : (
            <>
              <h2>L'ordinateur n'a pas reçu le code</h2>
              <p>Vérifie que la fenêtre « Scanner un jeu » y est toujours ouverte, puis réessaie.</p>
            </>
          )}
          <p className="small muted">Code lu : <span className="code">{formatBarcode(last.code)}</span></p>
          <button type="button" className="button button-primary button-block" onClick={() => setStep('scanning')}>Scanner un autre jeu</button>
        </div>
      )}
      {sent.length > 1 && (
        <details className="scan-history">
          <summary>Codes déjà envoyés ({sent.length})</summary>
          <ul className="plain-list scan-sent">
            {sent.map((s, i) => (
              <li key={`${s.code}-${i}`} className="list-row">
                <span><span className="code">{formatBarcode(s.code)}</span>{s.title ? ` · ${s.title}` : ''}</span>
                <span className={s.ok ? 'rule-ok' : 'error small'}>{s.ok ? '✓ envoyé' : 'non reçu'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="hint">Rien n'est enregistré sur ce téléphone, et l'image de l'appareil photo n'est envoyée nulle part : seuls les chiffres du code partent vers ton ordinateur. <Link to="/">Revenir au site</Link></p>
    </section>
  );
}
