import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatBarcode, LINK_PATTERN, linkChannel } from '../lib/barcode';
import type { BarcodeMatch } from '../lib/types';
import { ScanCamera } from '../components/ScanCamera';
import { CoverCamera } from '../components/CoverCamera';
import { usePhotoSender } from '../lib/photoLink';
import type { CaseFormat, Quad } from '../lib/coverPhoto';
import { ManualCode, matchLabel, useScanner } from '../components/Scanner';
import { tr } from '../lib/i18n';

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
  // Photo de jaquette pour l'ordinateur (?photo=…&format=cd|dvd|free)
  const photo = params.get('photo');
  if (photo && LINK_PATTERN.test(photo)) {
    const format = params.get('format');
    return <LinkedPhoto link={photo} initialFormat={format === 'dvd' || format === 'free' ? format : 'cd'} />;
  }
  return <StandaloneScanner />;
}

function StandaloneScanner() {
  const { handleCode } = useScanner();
  return (
    <section className="stack narrow">
      <h1>{tr('Scanner un jeu')}</h1>
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
      <h1>{tr("Scanner vers l'ordinateur")}</h1>
      {step === 'scanning' && (
        <>
          <p className={connected ? 'success' : 'notice'} aria-live="polite">
            {connected ? tr('Relié à ton ordinateur : scanne le code-barres au dos de la boîte.') : tr('Connexion à ton ordinateur…')}
          </p>
          <div className="panel stack"><ScanCamera onCode={send} /><ManualCode onCode={send} /></div>
        </>
      )}
      {step === 'sending' && <p className="loading">{tr('Envoi à ton ordinateur…')}</p>}
      {step === 'done' && last && (
        <div className={last.ok ? 'panel scan-done' : 'panel scan-done is-error'} role="status">
          <p className="scan-done-mark" aria-hidden="true">{last.ok ? '✓' : '!'}</p>
          {last.ok ? (
            <>
              <h2>{tr('Code envoyé : retourne sur ton ordinateur')}</h2>
              <p>
                {last.status === 'found' && <>{tr('La fiche de ')}<strong>{last.title}</strong>{tr(" vient de s'y ouvrir.")}</>}
                {last.status === 'several' && tr('Plusieurs versions portent ce code : choisis la tienne sur l’ordinateur.')}
                {last.status === 'unknown' && tr('Ce code n’est pas encore connu : retrouve ton jeu sur l’ordinateur pour l’associer à ta version.')}
              </p>
            </>
          ) : (
            <>
              <h2>{tr("L'ordinateur n'a pas reçu le code")}</h2>
              <p>{tr('Vérifie que la fenêtre « Scanner un jeu » y est toujours ouverte, puis réessaie.')}</p>
            </>
          )}
          <p className="small muted">{tr('Code lu : ')}<span className="code">{formatBarcode(last.code)}</span></p>
          <button type="button" className="button button-primary button-block" onClick={() => setStep('scanning')}>{tr('Scanner un autre jeu')}</button>
        </div>
      )}
      {sent.length > 1 && (
        <details className="scan-history">
          <summary>{tr('Codes déjà envoyés (')}{sent.length})</summary>
          <ul className="plain-list scan-sent">
            {sent.map((s, i) => (
              <li key={`${s.code}-${i}`} className="list-row">
                <span><span className="code">{formatBarcode(s.code)}</span>{s.title ? ` · ${s.title}` : ''}</span>
                <span className={s.ok ? 'rule-ok' : 'error small'}>{s.ok ? tr('✓ envoyé') : tr('non reçu')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="hint">{tr("Rien n'est enregistré sur ce téléphone, et l'image de l'appareil photo n'est envoyée nulle part : seuls les chiffres du code partent vers ton ordinateur. ")}<Link to="/">{tr('Revenir au site')}</Link></p>
    </section>
  );
}

// Photo de jaquette prise sur le téléphone pour l'ordinateur : appareil photo avec le
// cadre du boîtier, puis la photo part vers l'ordinateur (qui ouvre le recadrage) et
// l'appareil photo se coupe. Rien n'est enregistré sur le téléphone.
function LinkedPhoto({ link, initialFormat }: { link: string; initialFormat: CaseFormat }) {
  const { computerReady, send } = usePhotoSender(link);
  const [format, setFormat] = useState<CaseFormat>(initialFormat);
  const [shot, setShot] = useState<{ image: HTMLCanvasElement; quad: Quad; preview: string } | null>(null);
  const [step, setStep] = useState<'camera' | 'review' | 'sending' | 'done' | 'failed'>('camera');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function sendShot() {
    if (!shot) return;
    setStep('sending');
    setProgress(null);
    const ok = await send(shot.image, shot.quad, format, (done, total) => setProgress({ done, total }));
    setStep(ok ? 'done' : 'failed');
  }

  return (
    <section className="stack narrow photo-page">
      <h1>{tr('Photo de la jaquette')}</h1>
      {step === 'camera' && (
        <>
          <p className={computerReady ? 'small rule-ok' : 'small muted'} aria-live="polite">
            {computerReady ? tr('✓ Relié à ton ordinateur') : tr('Connexion à ton ordinateur…')}
          </p>
          <CoverCamera format={format} onFormat={setFormat}
            onPhoto={(image, quad) => { setShot({ image, quad, preview: image.toDataURL('image/jpeg', 0.7) }); setStep('review'); }} />
        </>
      )}
      {step === 'review' && shot && (
        <div className="panel stack">
          <img className="cover-shot" src={shot.preview} alt={tr('La photo prise')} />
          <p className="hint center">{tr('La jaquette est-elle nette et entière ? Tu ajusteras ses coins sur l’ordinateur.')}</p>
          <div className="actions">
            <button type="button" className="button" onClick={() => setStep('camera')}>{tr('Reprendre')}</button>
            <button type="button" className="button button-primary" onClick={sendShot} disabled={!computerReady}>
              {computerReady ? tr("Envoyer à l'ordinateur") : tr('En attente de l’ordinateur…')}
            </button>
          </div>
        </div>
      )}
      {step === 'sending' && (
        <p className="loading">{progress ? tr('Envoi à ton ordinateur… ({0} / {1})', progress.done, progress.total) : tr('Envoi à ton ordinateur…')}</p>
      )}
      {step === 'done' && (
        <div className="panel scan-done" role="status">
          <p className="scan-done-mark" aria-hidden="true">✓</p>
          <h2>{tr('Photo envoyée : continue sur ton ordinateur')}</h2>
          <p>{tr("L'appareil photo est coupé. Recadre la jaquette sur l'ordinateur, puis envoie-la aux modérateurs.")}</p>
          <button type="button" className="link-button small" onClick={() => setStep('camera')}>{tr('Reprendre une photo')}</button>
        </div>
      )}
      {step === 'failed' && (
        <div className="panel scan-done is-error" role="status">
          <p className="scan-done-mark" aria-hidden="true">!</p>
          <h2>{tr("L'ordinateur n'a pas reçu la photo")}</h2>
          <p>{tr('Vérifie que la fenêtre « Proposer une jaquette » y est toujours ouverte, puis réessaie.')}</p>
          <div className="actions">
            <button type="button" className="button" onClick={() => setStep('camera')}>{tr('Reprendre')}</button>
            <button type="button" className="button button-primary" onClick={sendShot}>{tr('Réessayer')}</button>
          </div>
        </div>
      )}
      <p className="hint">{tr("La photo n'est pas enregistrée sur ce téléphone : elle part directement vers ton ordinateur, sans être conservée en chemin. ")}<Link to="/">{tr('Revenir au site')}</Link></p>
    </section>
  );
}
