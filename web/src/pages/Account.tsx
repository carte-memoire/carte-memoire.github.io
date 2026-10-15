import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_IDLE_MINUTES, IDLE_CHOICES, MODERATOR_MAX_IDLE_MINUTES, idleMinutes, rememberIdleMinutes } from '../lib/preferences';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';
import { useConfirm } from '../components/Confirm';
import { CodeInput } from '../components/CodeInput';
import { useCodeConfirm } from '../components/CodeConfirm';
import { PsSymbol } from '../components/PsSymbol';
import { Dialog } from '../components/Dialog';
import { tr, locale } from '../lib/i18n';
import { motionChoice, setMotionChoice, systemReducesMotion, type MotionChoice } from '../lib/motion';
import { forgetTrust } from '../lib/trust';
import { usePageTitle } from '../lib/title';
import { LEAKED_PASSWORD_MESSAGE, passwordLeaked } from '../lib/pwned';

export function Account() {
  usePageTitle(tr('Mon compte'));
  const { profile, isModerator, aal } = useAuth();
  const mfaActive = aal.next === 'aal2';

  return (
    <section className="stack">
      <h1>{tr('Mon compte et sécurité')}</h1>
      {isModerator && !mfaActive && (
        <p className="warning">
          {tr('Tu es ')}{profile?.role === 'admin' ? 'admin' : tr('modérateur')}{tr(" : active la double authentification ci-dessous pour pouvoir modifier le catalogue. C'est obligatoire pour les comptes qui ont ce pouvoir.")}
        </p>
      )}
      <ProfileSection />
      <PasskeySection />
      <TotpSection />
      <PasswordSection />
      <DisplaySection />
      <SessionsSection />
      <DeleteAccountSection />
    </section>
  );
}

function ProfileSection() {
  const { session, profile, refresh } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setUsername(profile?.username ?? ''), [profile?.username]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(username)) return setError(tr('Pseudo : 3 à 30 caractères, lettres, chiffres, « _ » ou « - ».'));
    const { error } = await supabase.from('profile').update({ username }).eq('id', session!.user.id);
    if (error) return setError(error.code === '23505' ? tr('Ce pseudo est déjà pris.') : errorMessage(error));
    setError('');
    setMessage(tr('Pseudo enregistré.'));
    await refresh();
  }

  async function togglePublic(value: boolean) {
    const { error } = await supabase.from('profile').update({ public_collection: value }).eq('id', session!.user.id);
    if (error) return setError(errorMessage(error));
    await refresh();
  }

  return (
    <div className="panel">
      <h2>{tr('Profil')}</h2>
      <p className="muted small">{tr('Connecté avec ')}{session?.user.email}</p>
      <form onSubmit={save} className="form inline-form">
        <label className="field">
          <span className="field-label">{tr('Pseudo')}</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
        </label>
        <button type="submit" className="button"><PsSymbol shape="cross" />{tr(' Enregistrer')}</button>
      </form>
      <label className="switch">
        <input type="checkbox" checked={profile?.public_collection ?? false} onChange={(e) => togglePublic(e.target.checked)} />
        {tr('Rendre ma collection visible par tout le monde')}
      </label>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

interface PasskeyItem { id: string; friendly_name?: string; created_at: string; last_used_at?: string }

function PasskeySection() {
  const confirm = useConfirm();
  const { dialog: codeDialog, ensureCode } = useCodeConfirm();
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = 'PublicKeyCredential' in window;

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) return setError(errorMessage(error));
    setPasskeys(data ?? []);
  }, []);

  useEffect(() => { if (supported) load(); }, [load, supported]);

  async function add() {
    setError('');
    if (!(await ensureCode(tr('Pour ajouter une passkey, confirme que c’est bien toi.')))) return;
    setBusy(true);
    const { error } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await load();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: tr('Supprimer la passkey'), message: tr('Tu ne pourras plus te connecter avec cette passkey.'), confirmLabel: tr('Supprimer'), danger: true }))) return;
    if (!(await ensureCode(tr('Pour supprimer cette passkey, confirme que c’est bien toi.')))) return;
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (error) return setError(errorMessage(error));
    await load();
  }

  return (
    <div className="panel">
      <h2>{tr('Passkeys')}</h2>
      <p className="muted">
        {tr("Connexion sans mot de passe avec ton empreinte, ton visage, Windows Hello ou une clé de sécurité. Impossible à voler par hameçonnage (phishing) : c'est la méthode la plus sûre.")}
      </p>
      {!supported && <p className="warning">{tr('Ce navigateur ne gère pas les passkeys.')}</p>}
      {passkeys.length > 0 && (
        <ul className="plain-list">
          {passkeys.map((p) => (
            <li key={p.id} className="list-row">
              <span>
                {p.friendly_name || tr('Passkey')}{' '}
                <span className="muted small">{tr('ajoutée le ')}{new Date(p.created_at).toLocaleDateString(locale)}</span>
              </span>
              <button type="button" className="button button-small button-danger" onClick={() => remove(p.id)}>{tr('Supprimer')}</button>
            </li>
          ))}
        </ul>
      )}
      {supported && <button type="button" className="button button-primary" onClick={add} disabled={busy}><PsSymbol shape="triangle" />{tr(' Ajouter une passkey')}</button>}
      {error && <p className="error" role="alert">{error}</p>}
      {codeDialog}
    </div>
  );
}

function TotpSection() {
  const confirm = useConfirm();
  const { refresh, aal, session } = useAuth();
  const { dialog: codeDialog, ensureCode } = useCodeConfirm();
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function start() {
    setError('');
    // Un ancien essai d'activation non terminé est retiré avant d'en commencer un nouveau
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: tr('Application ({0})', new Date().toLocaleDateString(locale)) });
    if (error) return setError(errorMessage(error));
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnrollment(value: string) {
    if (!enrolling) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: value });
    if (error) {
      setCode('');
      return setError(errorMessage(error));
    }
    setEnrolling(null);
    setCode('');
    await load();
    await refresh();
  }

  function confirmEnrollment(e: FormEvent) {
    e.preventDefault();
    verifyEnrollment(code);
  }

  async function disable(id: string) {
    if (!(await confirm({ title: tr('Désactiver la double authentification'), message: tr('Ton compte sera moins protégé. Si tu es modérateur, tu ne pourras plus modifier le catalogue.'), confirmLabel: tr('Désactiver'), danger: true }))) return;
    if (!(await ensureCode(tr('Pour désactiver la double authentification, tape une dernière fois ton code.')))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return setError(errorMessage(error));
    // Les navigateurs de confiance n'ont plus d'objet (et ne vaudraient plus après une réactivation)
    if (session) forgetTrust(session.user.id);
    await supabase.auth.refreshSession();
    await load();
    await refresh();
  }

  return (
    <div className="panel">
      <h2>{tr('Double authentification')}</h2>
      <p className="muted">
        {tr("En plus du mot de passe, un code à 6 chiffres généré par une application (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS…). Même si quelqu'un vole ton mot de passe, il ne peut pas modifier tes données.")}
      </p>

      {factors.length > 0 ? (
        <>
          <p className="success">
            {tr('Activée')}{aal.current === 'aal2' ? tr(' et validée pour cette session') : ''}
            {aal.trust === 'passkey' ? tr(' (par ta passkey)') : aal.trust === 'browser' ? tr(' (navigateur de confiance)') : ''}.
          </p>
          {factors.map((f) => (
            <div key={f.id} className="list-row">
              <span>{f.friendly_name ?? tr('Application')}</span>
              <button type="button" className="button button-small button-danger" onClick={() => disable(f.id)}>{tr('Désactiver')}</button>
            </div>
          ))}
        </>
      ) : enrolling ? (
        <form onSubmit={confirmEnrollment} className="form">
          <ol className="steps">
            <li>{tr('Scanne ce QR code avec ton application :')}</li>
          </ol>
          <img className="qr" src={enrolling.qr} alt={tr('QR code de configuration de la double authentification')} width={180} height={180} />
          <p className="small">{tr('Ou saisis cette clé à la main : ')}<code className="secret">{enrolling.secret}</code></p>
          <div className="field">
            <span className="field-label">{tr("Puis entre le code affiché par l'application")}</span>
            <CodeInput label={tr("Code affiché par l'application")} value={code} onChange={setCode} onComplete={verifyEnrollment} />
          </div>
          <div className="actions">
            <button type="button" className="button" onClick={() => setEnrolling(null)}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-primary" disabled={code.length !== 6}><PsSymbol shape="cross" />{tr(' Activer')}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="button button-primary" onClick={start}><PsSymbol shape="triangle" />{tr(' Activer la double authentification')}</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {codeDialog}
    </div>
  );
}

function PasswordSection() {
  const { dialog: codeDialog, ensureCode } = useCodeConfirm();
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Changer de mot de passe demande de prouver son identité : un code est envoyé par e-mail
  async function sendCode() {
    setError('');
    const { error } = await supabase.auth.reauthenticate();
    if (error) return setError(errorMessage(error));
    setStep('code');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passwordIsValid(password)) return setError(tr('Le mot de passe ne respecte pas toutes les règles.'));
    if (password !== confirm) return setError(tr('Les deux mots de passe ne sont pas identiques.'));
    if (await passwordLeaked(password)) return setError(LEAKED_PASSWORD_MESSAGE);
    if (!(await ensureCode(tr('Pour changer de mot de passe, confirme aussi avec ton application d’authentification.')))) return;
    const { error } = await supabase.auth.updateUser({ password, nonce: code.trim() });
    if (error) return setError(errorMessage(error));
    await supabase.auth.signOut({ scope: 'others' });
    setStep('idle');
    setCode(''); setPassword(''); setConfirm(''); setError('');
    setMessage(tr('Mot de passe changé. Les autres appareils ont été déconnectés.'));
  }

  return (
    <div className="panel">
      <h2>{tr('Mot de passe')}</h2>
      {step === 'idle' ? (
        <button type="button" className="button" onClick={sendCode}>{tr('Changer mon mot de passe')}</button>
      ) : (
        <form onSubmit={submit} className="form">
          <div className="field">
            <span className="field-label">{tr('Code à 6 chiffres reçu par e-mail')}</span>
            <CodeInput label={tr('Code à 6 chiffres reçu par e-mail')} value={code} onChange={setCode} />
          </div>
          <label className="field">
            <span className="field-label">{tr('Nouveau mot de passe')}</span>
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
          </label>
          <PasswordRules password={password} />
          <label className="field">
            <span className="field-label">{tr('Confirmer')}</span>
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
          </label>
          <div className="actions">
            <button type="button" className="button" onClick={() => setStep('idle')}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-primary"><PsSymbol shape="cross" />{tr(' Changer')}</button>
          </div>
        </form>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {codeDialog}
    </div>
  );
}

// Délai de déconnexion automatique sur cet appareil
function IdleSetting() {
  const { isModerator } = useAuth();
  const [minutes, setMinutes] = useState(() => idleMinutes(isModerator));
  const label = (m: number) => (m < 60 ? tr('{0} minutes', m) : m < 1440 ? tr('{0} heure{1?s}', m / 60, m > 60) : tr('{0} jour{1?s}', m / 1440, m > 1440));
  return (
    <label className="field">
      <span className="field-label">{tr('Déconnexion automatique sur cet appareil, après')}</span>
      <select value={minutes} onChange={(e) => { const m = Number(e.target.value); rememberIdleMinutes(m); setMinutes(m); }}>
        {IDLE_CHOICES.filter((m) => !isModerator || m <= MODERATOR_MAX_IDLE_MINUTES).map((m) => (
          <option key={m} value={m}>{label(m)}{tr(' sans activité')}{m === DEFAULT_IDLE_MINUTES ? tr(' (conseillé)') : ''}</option>
        ))}
      </select>
      <span className="hint">
        {tr('Court sur un ordinateur partagé, plus long sur ton téléphone personnel.')}
        {isModerator && tr(' Modérateurs : une heure au plus, car votre compte peut modifier le catalogue.')}
      </span>
    </label>
  );
}

// Animations sur cet appareil : comme le système le demande, ou forcées, ou coupées
function DisplaySection() {
  const [choice, setChoice] = useState<MotionChoice>(motionChoice);
  const reduced = systemReducesMotion();
  const options: { value: MotionChoice; label: string }[] = [
    { value: 'auto', label: reduced ? tr("Comme l'appareil (coupées)") : tr("Comme l'appareil (activées)") },
    { value: 'on', label: tr('Toujours') },
    { value: 'off', label: tr('Jamais') },
  ];
  function choose(value: MotionChoice) {
    setMotionChoice(value);
    setChoice(value);
  }
  return (
    <div className="panel stack">
      <h2>{tr('Affichage')}</h2>
      <fieldset className="pill-choice">
        <legend className="field-label">{tr('Animations sur cet appareil')}</legend>
        <div className="pills">
          {options.map((o) => (
            <label key={o.value} className={choice === o.value ? 'pill active' : 'pill'}>
              <input type="radio" name="animations" className="sr-only" checked={choice === o.value} onChange={() => choose(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        <span className="hint">
          {reduced
            ? tr("Ton appareil demande moins d'animations (sous Windows : Paramètres › Accessibilité › Effets visuels › Effets d'animation). « Toujours » les rétablit ici, sans toucher au réglage du système.")
            : tr("Les animations suivent le réglage d'accessibilité de ton appareil ; « Jamais » les coupe ici seulement.")}
        </span>
      </fieldset>
    </div>
  );
}

interface TrustedBrowser { id: string; label: string; created_at: string; last_used_at: string | null; expires_at: string; is_current: boolean }

// Navigateurs où le code à 6 chiffres n'est plus demandé (30 jours) : on peut les retirer
function TrustedBrowsers() {
  const { session, aal } = useAuth();
  const [list, setList] = useState<TrustedBrowser[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_trusted_browsers');
    // Liste illisible (hors ligne…) : la section ne s'affiche pas
    setList(error ? null : (data as TrustedBrowser[] | null) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revoke(browser: TrustedBrowser) {
    const { error } = await supabase.rpc('revoke_trusted_browser', { browser: browser.id });
    if (error) return setError(errorMessage(error));
    if (browser.is_current && session) forgetTrust(session.user.id);
    await load();
  }

  // Sans double authentification, rien à retenir
  if (aal.next !== 'aal2' || list === null) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale);
  return (
    <div className="stack trusted-browsers">
      <h3>{tr('Navigateurs de confiance')}</h3>
      {error && <p className="error">{error}</p>}
      {list && list.length === 0 && (
        <p className="muted small">{tr('Aucun : le code à 6 chiffres est demandé à chaque connexion. Coche « Faire confiance à ce navigateur » au moment du code pour ne plus le taper sur un appareil qui est le tien.')}</p>
      )}
      {list && list.length > 0 && (
        <ul className="plain-list">
          {list.map((b) => (
            <li key={b.id} className="list-row">
              <span>
                <strong>{b.label || tr('Navigateur')}</strong>
                {b.is_current && <span className="badge badge-owned">{tr('ce navigateur')}</span>}
                <span className="muted small">{tr(' · depuis le {0}, jusqu’au {1}', day(b.created_at), day(b.expires_at))}</span>
              </span>
              <button type="button" className="button button-small" onClick={() => revoke(b)}>{tr('Retirer')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionsSection() {
  const { session, signOut } = useAuth();
  const confirm = useConfirm();

  async function signOutEverywhere() {
    if (await confirm({
      title: tr('Se déconnecter de tous les appareils'),
      message: tr('Toutes les sessions ouvertes (ordinateurs, téléphones…) seront fermées, celle-ci comprise, et plus aucun navigateur ne sera de confiance. Utile si tu as oublié de te déconnecter quelque part, ou en cas de doute.'),
      confirmLabel: tr('Tout déconnecter'),
      danger: true,
    })) {
      await supabase.rpc('revoke_trusted_browsers');
      if (session) forgetTrust(session.user.id);
      await signOut(true);
    }
  }
  return (
    <div className="panel stack">
      <h2>{tr('Sessions')}</h2>
      <IdleSetting />
      <TrustedBrowsers />
      <p className="muted">{tr("Un doute sur un appareil (ordinateur partagé, téléphone perdu) ? Déconnecte-les tous d'un coup.")}</p>
      <button type="button" className="button button-danger" onClick={signOutEverywhere}>{tr('Se déconnecter de tous les appareils')}</button>
    </div>
  );
}

// Droit à l'effacement (RGPD) : la personne supprime elle-même son compte
function DeleteAccountSection() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // Images envoyées avec des propositions (dossier personnel du stockage)
    const folder = session!.user.id;
    const { data: files } = await supabase.storage.from('submission-images').list(folder, { limit: 1000 });
    if (files?.length) await supabase.storage.from('submission-images').remove(files.map((f) => `${folder}/${f.name}`));
    const { error } = await supabase.rpc('delete_my_account', { confirmation: typed.trim() });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    // Rechargement complet vers l'accueil : une simple navigation pouvait être devancée par
    // la redirection des pages réservées (session fermée → « Connexion »), et le message perdu
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    window.location.replace('/?compte=supprime');
  }

  return (
    <section className="panel danger-zone">
      <h2>{tr('Supprimer mon compte')}</h2>
      <p className="muted">
        {tr('Ton compte, ton profil et ta collection seront effacés définitivement, ainsi que tes passkeys et ta double authentification. Tes propositions déjà traitées, tes signalements et tes modifications du catalogue restent, sans ton nom (« compte supprimé »). Pense à ')}<Link to="/collection">{tr('exporter ta collection')}</Link>{tr(' avant.')}
      </p>
      <button type="button" className="button button-danger" onClick={() => { setOpen(true); setTyped(''); setError(''); }}>{tr('Supprimer mon compte…')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={tr('Supprimer mon compte')}>
        <form onSubmit={remove} className="form">
          <p className="warning">{tr('Suppression ')}<strong>{tr('définitive')}</strong>{tr(' : impossible de revenir en arrière.')}</p>
          <label className="field">
            <span className="field-label">{tr('Pour confirmer, tape SUPPRIMER')}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus="" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="button" onClick={() => setOpen(false)}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
            <button type="submit" className="button button-danger" disabled={busy || typed.trim() !== 'SUPPRIMER'}>
              {busy ? tr('Suppression…') : tr('Supprimer définitivement')}
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
