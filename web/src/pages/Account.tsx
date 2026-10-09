import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/AuthContext';
import { PasswordRules, passwordIsValid } from '../components/PasswordRules';
import { useConfirm } from '../components/Confirm';
import { PsSymbol } from '../components/PsSymbol';

export function Account() {
  const { profile, isModerator, aal } = useAuth();
  const mfaActive = aal.next === 'aal2';

  return (
    <section className="stack">
      <h1>Mon compte et sécurité</h1>
      {isModerator && !mfaActive && (
        <p className="warning">
          Tu es {profile?.role === 'admin' ? 'admin' : 'modérateur'} : active la double authentification
          ci-dessous pour pouvoir modifier le catalogue. C'est obligatoire pour les comptes qui ont ce pouvoir.
        </p>
      )}
      <ProfileSection />
      <PasskeySection />
      <TotpSection />
      <PasswordSection />
      <SessionsSection />
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
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(username)) return setError('Pseudo : 3 à 30 caractères, lettres, chiffres, « _ » ou « - ».');
    const { error } = await supabase.from('profile').update({ username }).eq('id', session!.user.id);
    if (error) return setError(error.code === '23505' ? 'Ce pseudo est déjà pris.' : errorMessage(error));
    setError('');
    setMessage('Pseudo enregistré.');
    await refresh();
  }

  async function togglePublic(value: boolean) {
    const { error } = await supabase.from('profile').update({ public_collection: value }).eq('id', session!.user.id);
    if (error) return setError(errorMessage(error));
    await refresh();
  }

  return (
    <div className="panel">
      <h2>Profil</h2>
      <p className="muted small">Connecté avec {session?.user.email}</p>
      <form onSubmit={save} className="form inline-form">
        <label className="field">
          <span className="field-label">Pseudo</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
        </label>
        <button type="submit" className="button"><PsSymbol shape="cross" /> Enregistrer</button>
      </form>
      <label className="switch">
        <input type="checkbox" checked={profile?.public_collection ?? false} onChange={(e) => togglePublic(e.target.checked)} />
        Rendre ma collection visible par tout le monde
      </label>
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

interface PasskeyItem { id: string; friendly_name?: string; created_at: string; last_used_at?: string }

function PasskeySection() {
  const confirm = useConfirm();
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
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await load();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: 'Supprimer la passkey', message: 'Tu ne pourras plus te connecter avec cette passkey.', confirmLabel: 'Supprimer', danger: true }))) return;
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (error) return setError(errorMessage(error));
    await load();
  }

  return (
    <div className="panel">
      <h2>Passkeys</h2>
      <p className="muted">
        Connexion sans mot de passe avec ton empreinte, ton visage, Windows Hello ou une clé de sécurité.
        Impossible à voler par hameçonnage (phishing) : c'est la méthode la plus sûre.
      </p>
      {!supported && <p className="warning">Ce navigateur ne gère pas les passkeys.</p>}
      {passkeys.length > 0 && (
        <ul className="plain-list">
          {passkeys.map((p) => (
            <li key={p.id} className="list-row">
              <span>
                {p.friendly_name || 'Passkey'}{' '}
                <span className="muted small">ajoutée le {new Date(p.created_at).toLocaleDateString('fr-FR')}</span>
              </span>
              <button type="button" className="button button-small button-danger" onClick={() => remove(p.id)}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}
      {supported && <button type="button" className="button button-primary" onClick={add} disabled={busy}><PsSymbol shape="triangle" /> Ajouter une passkey</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function TotpSection() {
  const confirm = useConfirm();
  const { refresh, aal } = useAuth();
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
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Application (${new Date().toLocaleDateString('fr-FR')})` });
    if (error) return setError(errorMessage(error));
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnrollment(e: FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.trim() });
    if (error) return setError(errorMessage(error));
    setEnrolling(null);
    setCode('');
    await load();
    await refresh();
  }

  async function disable(id: string) {
    if (!(await confirm({ title: 'Désactiver la double authentification', message: 'Ton compte sera moins protégé. Si tu es modérateur, tu ne pourras plus modifier le catalogue.', confirmLabel: 'Désactiver', danger: true }))) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return setError(errorMessage(error));
    await supabase.auth.refreshSession();
    await load();
    await refresh();
  }

  return (
    <div className="panel">
      <h2>Double authentification</h2>
      <p className="muted">
        En plus du mot de passe, un code à 6 chiffres généré par une application (Google Authenticator,
        Microsoft Authenticator, Aegis, 2FAS…). Même si quelqu'un vole ton mot de passe, il ne peut pas
        modifier tes données.
      </p>

      {factors.length > 0 ? (
        <>
          <p className="success">Activée{aal.current === 'aal2' ? ' et validée pour cette session' : ''}.</p>
          {factors.map((f) => (
            <div key={f.id} className="list-row">
              <span>{f.friendly_name ?? 'Application'}</span>
              <button type="button" className="button button-small button-danger" onClick={() => disable(f.id)}>Désactiver</button>
            </div>
          ))}
        </>
      ) : enrolling ? (
        <form onSubmit={confirmEnrollment} className="form">
          <ol className="steps">
            <li>Scanne ce QR code avec ton application :</li>
          </ol>
          <img className="qr" src={enrolling.qr} alt="QR code de configuration de la double authentification" width={180} height={180} />
          <p className="small">Ou saisis cette clé à la main : <code className="secret">{enrolling.secret}</code></p>
          <label className="field">
            <span className="field-label">Puis entre le code affiché par l'application</span>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <div className="actions">
            <button type="button" className="button" onClick={() => setEnrolling(null)}><PsSymbol shape="circle" /> Annuler</button>
            <button type="submit" className="button button-primary" disabled={code.length !== 6}><PsSymbol shape="cross" /> Activer</button>
          </div>
        </form>
      ) : (
        <button type="button" className="button button-primary" onClick={start}><PsSymbol shape="triangle" /> Activer la double authentification</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function PasswordSection() {
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
    if (!passwordIsValid(password)) return setError('Le mot de passe ne respecte pas toutes les règles.');
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.');
    const { error } = await supabase.auth.updateUser({ password, nonce: code.trim() });
    if (error) return setError(errorMessage(error));
    await supabase.auth.signOut({ scope: 'others' });
    setStep('idle');
    setCode(''); setPassword(''); setConfirm(''); setError('');
    setMessage('Mot de passe changé. Les autres appareils ont été déconnectés.');
  }

  return (
    <div className="panel">
      <h2>Mot de passe</h2>
      {step === 'idle' ? (
        <button type="button" className="button" onClick={sendCode}>Changer mon mot de passe</button>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span className="field-label">Code reçu par e-mail</span>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span className="field-label">Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
          </label>
          <PasswordRules password={password} />
          <label className="field">
            <span className="field-label">Confirmer</span>
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
          </label>
          <div className="actions">
            <button type="button" className="button" onClick={() => setStep('idle')}><PsSymbol shape="circle" /> Annuler</button>
            <button type="submit" className="button button-primary"><PsSymbol shape="cross" /> Changer</button>
          </div>
        </form>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function SessionsSection() {
  const { signOut } = useAuth();
  return (
    <div className="panel">
      <h2>Sessions</h2>
      <p className="muted">Un doute sur un appareil (ordinateur partagé, téléphone perdu) ? Déconnecte-les tous d'un coup.</p>
      <button type="button" className="button button-danger" onClick={() => signOut(true)}>Se déconnecter de tous les appareils</button>
    </div>
  );
}
