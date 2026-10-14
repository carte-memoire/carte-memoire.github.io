import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { cameraAvailable, formatBarcode, isTouchDevice, linkChannel, normalizeBarcode } from '../lib/barcode';
import { editionLabel, gamePath, languagesShort, zoneLabel } from '../lib/format';
import type { BarcodeMatch } from '../lib/types';
import { Dialog } from './Dialog';
import { GameSearch } from './GameSearch';
import { ScanCamera } from './ScanCamera';
import { tr } from '../lib/i18n';

// Scan du code-barres d'une boîte de jeu, pour ouvrir directement la fiche de sa version.
// - Téléphone : l'appareil photo s'ouvre dans la fenêtre.
// - Ordinateur : un QR code relie le téléphone (page /scanner) ; chaque code scanné sur
//   le téléphone ouvre la fiche ici, tant que la liaison reste active. Le téléphone
//   n'envoie que des chiffres, revérifiés ici (clé de contrôle) avant toute recherche.
// - Code inconnu : on retrouve le jeu, puis sa version, et le code lui est associé.

type View =
  | { kind: 'camera' }
  | { kind: 'phone' }
  | { kind: 'looking'; code: string }
  | { kind: 'choices'; code: string; matches: BarcodeMatch[] }
  | { kind: 'unknown'; code: string }
  | { kind: 'error'; code: string; message: string };

interface ScannerApi {
  open: () => void;
  handleCode: (code: string) => void;
  linked: boolean;
  phoneReady: boolean;
  unlink: () => void;
}

const ScannerContext = createContext<ScannerApi | null>(null);

export function useScanner(): ScannerApi {
  const api = useContext(ScannerContext);
  if (!api) throw new Error(tr('useScanner doit être utilisé dans <ScannerProvider>'));
  return api;
}

export function versionPath(m: Pick<BarcodeMatch, 'game_id' | 'game_title' | 'release_id'>): string {
  return `${gamePath({ id: m.game_id, title: m.game_title })}?version=${m.release_id}`;
}

export function matchLabel(m: BarcodeMatch): string {
  return [m.local_title, zoneLabel(m.zone), editionLabel({ ...m, platform: { short_name: m.platform } }), languagesShort(m.languages)]
    .filter(Boolean).join(' · ');
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: 'camera' });
  const [link, setLink] = useState<string | null>(null);
  const [phoneReady, setPhoneReady] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function handleCode(code: string, fromPhone = false) {
    setView({ kind: 'looking', code });
    const { data, error } = await supabase.rpc('releases_by_barcode', { code });
    if (error) {
      setOpen(true);
      return setView({ kind: 'error', code, message: errorMessage(error) });
    }
    const matches = (data as BarcodeMatch[]) ?? [];
    if (matches.length === 1) {
      setOpen(false);
      navigate(versionPath(matches[0]));
      if (fromPhone) {
        clearTimeout(noticeTimer.current);
        setNotice(tr('Code reçu du téléphone : {0}', matches[0].local_title));
        noticeTimer.current = setTimeout(() => setNotice(''), 4000);
      }
      return;
    }
    setOpen(true);
    setView(matches.length > 0 ? { kind: 'choices', code, matches } : { kind: 'unknown', code });
  }

  // Les messages du téléphone appellent toujours la dernière version de handleCode
  const handleRef = useRef(handleCode);
  handleRef.current = handleCode;

  useEffect(() => {
    if (!link) return;
    const channel = supabase.channel(linkChannel(link), { config: { broadcast: { self: false } } });
    // Présence : le serveur sait si le téléphone est là (et s'il part, même sans prévenir)
    channel
      .on('presence', { event: 'sync' }, () => setPhoneReady(Object.keys(channel.presenceState()).length > 0))
      .on('broadcast', { event: 'code' }, ({ payload }) => {
        const code = normalizeBarcode(String((payload as { code?: unknown } | undefined)?.code ?? '').slice(0, 20));
        if (code) handleRef.current(code, true);
      })
      .subscribe();
    return () => {
      setPhoneReady(false);
      supabase.removeChannel(channel);
    };
  }, [link]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  function openScanner() {
    const phone = isTouchDevice() && cameraAvailable();
    setView({ kind: phone ? 'camera' : 'phone' });
    if (!phone && !link) setLink(crypto.randomUUID());
    setOpen(true);
  }

  function close() {
    setOpen(false);
    // Téléphone jamais relié : la liaison ne sert à rien
    if (!phoneReady) setLink(null);
  }

  const api: ScannerApi = {
    open: openScanner,
    handleCode: (code) => handleCode(code),
    linked: Boolean(link) && phoneReady,
    phoneReady,
    unlink: () => setLink(null),
  };

  return (
    <ScannerContext.Provider value={api}>
      {children}
      <Dialog open={open} onClose={close} title={tr('Scanner un jeu')}>
        <ScannerView
          view={view}
          link={link}
          phoneReady={phoneReady}
          onCode={(code) => handleCode(code)}
          onView={(v) => { if (v.kind === 'phone' && !link) setLink(crypto.randomUUID()); setView(v); }}
          onPick={(m) => { setOpen(false); navigate(versionPath(m)); }}
          onUnknownGame={(path) => { setOpen(false); navigate(path); }}
        />
      </Dialog>
      {notice && <div className="toast" role="status">{notice}</div>}
    </ScannerContext.Provider>
  );
}

function ScannerView({ view, link, phoneReady, onCode, onView, onPick, onUnknownGame }: {
  view: View;
  link: string | null;
  phoneReady: boolean;
  onCode: (code: string) => void;
  onView: (view: View) => void;
  onPick: (match: BarcodeMatch) => void;
  onUnknownGame: (path: string) => void;
}) {
  const touch = isTouchDevice();
  switch (view.kind) {
    case 'camera':
      return (
        <>
          <ScanCamera onCode={onCode} />
          <ManualCode onCode={onCode} />
          {!touch && <button type="button" className="link-button small" onClick={() => onView({ kind: 'phone' })}>{tr('Scanner plutôt avec mon téléphone')}</button>}
        </>
      );
    case 'phone':
      return (
        <>
          {link && <PhoneQr link={link} />}
          <p className={phoneReady ? 'success' : 'notice'} aria-live="polite">
            {phoneReady ? tr('Téléphone relié : scanne le code-barres de ton jeu, sa fiche s’ouvrira ici.') : tr('En attente du téléphone…')}
          </p>
          <ol className="steps small">
            <li>{tr("Ouvre l'appareil photo de ton téléphone et vise ce QR code.")}</li>
            <li>{tr("Touche le lien qui apparaît : le scanner du site s'ouvre.")}</li>
            <li>{tr("Scanne le code-barres au dos de la boîte : la fiche de ta version s'ouvre sur cet ordinateur. Tu peux enchaîner les jeux.")}</li>
          </ol>
          <ManualCode onCode={onCode} />
          {cameraAvailable() && <button type="button" className="link-button small" onClick={() => onView({ kind: 'camera' })}>{tr('Utiliser plutôt la webcam de cet ordinateur')}</button>}
        </>
      );
    case 'looking':
      return <p className="loading">{tr('Recherche du code ')}{formatBarcode(view.code)}…</p>;
    case 'choices':
      return (
        <>
          <p>{tr('Le code ')}<span className="code">{formatBarcode(view.code)}</span>{tr(' correspond à plusieurs versions : laquelle as-tu ?')}</p>
          <ul className="choice-list">
            {view.matches.map((m) => (
              <li key={m.release_id}><button type="button" className="choice" onClick={() => onPick(m)}>{matchLabel(m)}</button></li>
            ))}
          </ul>
        </>
      );
    case 'unknown':
      return (
        <>
          <p className="notice">
            {tr('Le code ')}<span className="code">{formatBarcode(view.code)}</span>{tr(" n'est pas encore dans la base. Aide les autres collectionneurs : retrouve ton jeu, puis choisis ta version sur sa fiche. Le prochain qui scannera ce code tombera directement dessus.")}
          </p>
          <GameSearch autoFocus label={tr('Quel est ce jeu ?')} onSelect={(g) => onUnknownGame(`${gamePath(g)}?code=${view.code}`)} />
          <button type="button" className="link-button small" onClick={() => onView({ kind: touch ? 'camera' : 'phone' })}>{tr('Scanner un autre code')}</button>
        </>
      );
    case 'error':
      return (
        <>
          <p className="error">{view.message}</p>
          <button type="button" className="button" onClick={() => onView({ kind: touch ? 'camera' : 'phone' })}>{tr('Réessayer')}</button>
        </>
      );
  }
}

// Le QR code qui ouvre le scanner sur le téléphone, relié à cet ordinateur
function PhoneQr({ link }: { link: string }) {
  return <QrImage url={`${window.location.origin}/scanner?lien=${link}`} alt={tr('QR code à viser avec le téléphone pour ouvrir le scanner')} />;
}

// Un QR code (générateur chargé seulement quand il faut en afficher un)
export function QrImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      if (active) setSrc(qr.createDataURL(5, 2));
    });
    return () => { active = false; };
  }, [url]);
  return (
    <p className="center">
      {src
        ? <img className="qr" src={src} alt={alt} width={220} height={220} />
        : <span className="loading">{tr('Préparation du QR code…')}</span>}
    </p>
  );
}

// Saisie à la main des chiffres sous les barres (pas d'appareil photo, code abîmé)
export function ManualCode({ onCode }: { onCode: (code: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeBarcode(text);
    if (!code) return setError(tr('Code incomplet ou mal recopié : vérifie les chiffres (13 pour un jeu européen ou japonais, 12 pour un jeu américain).'));
    setError('');
    onCode(code);
  }
  return (
    <form className="manual-code" onSubmit={submit}>
      <label className="field">
        <span className="field-label">{tr('Ou tape les chiffres sous le code-barres')}</span>
        <span className="manual-code-row">
          <input inputMode="numeric" autoComplete="off" maxLength={20} value={text} onChange={(e) => setText(e.target.value)} placeholder="5 028587 080131" />
          <button type="submit" className="button">{tr('Chercher')}</button>
        </span>
      </label>
      {error && <p className="error small">{error}</p>}
    </form>
  );
}
