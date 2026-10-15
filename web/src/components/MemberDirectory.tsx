import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { formatDate, formatDateTime, formatNumber } from '../lib/format';
import type { UserRole } from '../lib/types';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from './Confirm';
import { Dialog } from './Dialog';
import { Pagination } from './Pagination';
import { PsSymbol } from './PsSymbol';
import { tr } from '../lib/i18n';
import { Avatar } from './Avatar';
import { removeAvatarFolder } from '../lib/avatar';

// Modération → Membres.
// - Modérateurs : les pseudos des membres, rien d'autre.
// - Admins : la fiche de chaque membre (adresse e-mail, inscription, dernière connexion,
//   double authentification, collection, propositions) et les actions : rôle, renommer,
//   suspendre ou rétablir, supprimer. La base vérifie tout (rôle, double authentification,
//   garde-fous) : l'écran ne fait que proposer.

const PAGE_SIZE = 50;

interface MemberName { username: string; total_count: number }
interface AdminMember {
  id: string;
  username: string;
  avatar: string | null;
  role: UserRole;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  two_factor: boolean;
  banned_until: string | null;
  ban_reason: string | null;
  owned_count: number;
  wanted_count: number;
  submission_count: number;
  total_count: number;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'member', label: tr('Membre') },
  { value: 'moderator', label: tr('Modérateur') },
  { value: 'admin', label: tr('Admin') },
];
const roleLabel = (role: UserRole) => ROLES.find((r) => r.value === role)?.label ?? role;

// Durées de suspension proposées (null : sans limite)
const BAN_DURATIONS: { days: number | null; label: string }[] = [
  { days: 1, label: tr('1 jour') },
  { days: 7, label: tr('7 jours') },
  { days: 30, label: tr('30 jours') },
  { days: 365, label: tr('1 an') },
  { days: null, label: tr('Sans limite de durée') },
];

// Suspension « sans limite » : enregistrée pour 100 ans
function banText(until: string): string {
  return new Date(until).getFullYear() - new Date().getFullYear() > 50
    ? tr('Suspendu sans limite de durée')
    : tr('Suspendu jusqu’au {0}', formatDateTime(until));
}

export function MemberDirectory() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // Liste lue, et pour quel rôle (pseudos seuls, ou fiches complètes de l'admin) : une liste
  // lue pour l'autre rôle (rôle pas encore connu au premier affichage) n'est jamais montrée
  const [result, setResult] = useState<{ admin: boolean; rows: (MemberName | AdminMember)[] } | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  // Recherche : lancée une fois la saisie terminée
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const args = { search: query || null, max_results: PAGE_SIZE, start_at: (page - 1) * PAGE_SIZE };
    (isAdmin ? supabase.rpc('admin_members', args) : supabase.rpc('member_names', args)).then(({ data, error: failure }) => {
      if (!active) return;
      setError(failure ? errorMessage(failure) : '');
      setResult({ admin: isAdmin, rows: (data as (MemberName | AdminMember)[] | null) ?? [] });
    });
    return () => { active = false; };
  }, [isAdmin, query, page, version]);

  const rows = result?.admin === isAdmin ? result.rows : null;
  const total = rows?.[0]?.total_count ?? 0;

  return (
    <div className="stack">
      <p className="muted">
        {isAdmin
          ? tr('Fiche de chaque membre et actions sur son compte. Toi seul, en tant qu’admin, vois les adresses e-mail.')
          : tr('Les pseudos des membres. Les actions sur les comptes (rôle, suspension, suppression) sont réservées aux admins.')}
      </p>
      <label className="field member-search">
        <span className="field-label">{isAdmin ? tr('Rechercher un membre (pseudo ou adresse e-mail)') : tr('Rechercher un membre (pseudo)')}</span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Ex. : Gégé')} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null && <p className="loading">{tr('Lecture des membres…')}</p>}
      {rows?.length === 0 && !error && <p className="panel empty">{tr('Aucun membre trouvé.')}</p>}
      {rows && rows.length > 0 && (
        <>
          <p className="muted small">{tr('{0} membre{1?s}', formatNumber(total), total > 1)}</p>
          {isAdmin ? (
            <ul className="plain-list queue-list">
              {(rows as AdminMember[]).map((m) => <MemberCard key={m.id} member={m} onChanged={() => setVersion((v) => v + 1)} />)}
            </ul>
          ) : (
            <ul className="member-names">
              {(rows as MemberName[]).map((m) => (
                <li key={m.username}><Link to={`/membre/${encodeURIComponent(m.username)}`}>{m.username}</Link></li>
              ))}
            </ul>
          )}
        </>
      )}
      {total > PAGE_SIZE && (
        <Pagination page={page} pages={Math.ceil(total / PAGE_SIZE)} onChange={setPage} label={tr('Pages des membres')} />
      )}
    </div>
  );
}

function MemberCard({ member: m, onChanged }: { member: AdminMember; onChanged: () => void }) {
  const { session } = useAuth();
  const confirm = useConfirm();
  const self = m.id === session?.user.id;
  const [dialog, setDialog] = useState<'rename' | 'ban' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(call: PromiseLike<{ error: unknown }>): Promise<boolean> {
    setBusy(true);
    setError('');
    const { error: failure } = await call;
    setBusy(false);
    if (failure) {
      setError(errorMessage(failure));
      return false;
    }
    onChanged();
    return true;
  }

  async function changeRole(role: UserRole) {
    if (role === m.role) return;
    const ok = await confirm({
      title: tr('Changer le rôle'),
      message: role === 'member'
        ? tr('{0} redevient simple membre et perd l’accès à la modération.', m.username)
        : tr('{0} devient {1} : accès à la modération, double authentification obligatoire.', m.username, roleLabel(role).toLowerCase()),
      confirmLabel: tr('Changer le rôle'),
    });
    if (ok) await run(supabase.rpc('set_user_role', { target_user: m.id, new_role: role }));
  }

  // Photo inappropriée : retirée du profil, puis le fichier supprimé
  async function removePhoto() {
    const ok = await confirm({ title: tr('Retirer la photo de profil'), message: tr('La photo de {0} sera supprimée. Il pourra en mettre une autre.', m.username), confirmLabel: tr('Retirer la photo'), danger: true });
    if (!ok) return;
    const done = await run(supabase.rpc('admin_remove_avatar', { target: m.id }).then(async (result) => {
      if (!result.error && typeof result.data === 'string') await supabase.storage.from('avatars').remove([result.data]);
      return result;
    }));
    if (done) setError('');
  }

  async function unban() {
    const ok = await confirm({ title: tr('Lever la suspension'), message: tr('{0} pourra de nouveau se connecter et contribuer.', m.username), confirmLabel: tr('Lever la suspension') });
    if (ok) await run(supabase.rpc('admin_unban_member', { target: m.id }));
  }

  return (
    <li className="panel member-card">
      <div className="member-head">
        <Avatar username={m.username} path={m.avatar} size="medium" />
        <Link to={`/membre/${encodeURIComponent(m.username)}`} className="block-title">{m.username}</Link>
        <span className={`badge badge-role-${m.role}`}>{roleLabel(m.role)}</span>
        {m.banned_until && <span className="badge badge-banned">{banText(m.banned_until)}</span>}
        {self && <span className="badge">{tr('toi')}</span>}
      </div>
      <dl className="member-facts">
        <dt>{tr('Adresse e-mail')}</dt>
        <dd>{m.email ?? '—'}{!m.email_confirmed && <span className="muted">{tr(' (pas encore confirmée)')}</span>}</dd>
        <dt>{tr('Inscription')}</dt>
        <dd>{formatDate(m.created_at.slice(0, 10), 'day')}</dd>
        <dt>{tr('Dernière connexion')}</dt>
        <dd>{m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : tr('jamais')}</dd>
        <dt>{tr('Double authentification')}</dt>
        <dd>{m.two_factor ? tr('activée') : tr('non')}</dd>
        <dt>{tr('Collection')}</dt>
        <dd>{tr('{0} possédé{1?s} · {2} recherché{3?s}', formatNumber(m.owned_count), m.owned_count > 1, formatNumber(m.wanted_count), m.wanted_count > 1)}</dd>
        <dt>{tr('Propositions')}</dt>
        <dd>{formatNumber(m.submission_count)}</dd>
        {m.banned_until && m.ban_reason && (
          <>
            <dt>{tr('Raison de la suspension')}</dt>
            <dd>{m.ban_reason}</dd>
          </>
        )}
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      {self ? (
        <p className="muted small">{tr('Ton propre compte se gère dans « Mon compte ».')}</p>
      ) : (
        <div className="actions member-actions">
          <label className="member-role">
            <span className="field-label">{tr('Rôle')}</span>
            <select value={m.role} onChange={(e) => changeRole(e.target.value as UserRole)} disabled={busy}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button type="button" className="button button-small" onClick={() => setDialog('rename')} disabled={busy}>
            <PsSymbol shape="triangle" />{tr(' Renommer')}
          </button>
          {m.banned_until ? (
            <button type="button" className="button button-small" onClick={unban} disabled={busy}>
              <PsSymbol shape="circle" />{tr(' Lever la suspension')}
            </button>
          ) : m.role !== 'admin' && (
            <button type="button" className="button button-small" onClick={() => setDialog('ban')} disabled={busy}>
              <PsSymbol shape="square" />{tr(' Suspendre')}
            </button>
          )}
          {m.avatar && (
            <button type="button" className="button button-small" onClick={removePhoto} disabled={busy}>
              <PsSymbol shape="circle" />{tr(' Retirer la photo')}
            </button>
          )}
          {m.role !== 'admin' && (
            <button type="button" className="button button-small button-danger" onClick={() => setDialog('delete')} disabled={busy}>
              <PsSymbol shape="cross" />{tr(' Supprimer')}
            </button>
          )}
        </div>
      )}
      {dialog === 'rename' && <RenameDialog member={m} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === 'ban' && <BanDialog member={m} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === 'delete' && <DeleteDialog member={m} onClose={() => setDialog(null)} onDone={onChanged} />}
    </li>
  );
}

interface ActionProps { member: AdminMember; onClose: () => void; onDone: () => void }

// Fenêtre d'action : envoi, message d'erreur, fermeture une fois fait
function useAction(onClose: () => void, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(call: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError('');
    const { error: failure } = await call();
    setBusy(false);
    if (failure) return setError(errorMessage(failure));
    onDone();
    onClose();
  }
  return { busy, error, send };
}

function RenameDialog({ member: m, onClose, onDone }: ActionProps) {
  const [name, setName] = useState(m.username);
  const { busy, error, send } = useAction(onClose, onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    send(() => supabase.rpc('admin_rename_member', { target: m.id, new_username: name.trim() }));
  }
  return (
    <Dialog open onClose={onClose} title={tr('Renommer {0}', m.username)}>
      <form onSubmit={submit} className="form">
        <p className="muted">{tr('Pour un pseudo inapproprié. Le membre se connecte toujours avec son adresse e-mail ; sa page publique change d’adresse.')}</p>
        <label className="field">
          <span className="field-label">{tr('Nouveau pseudo (3 à 30 caractères : lettres sans accents, chiffres, - et _)')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]{3,30}" data-autofocus="" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button" onClick={onClose}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
          <button type="submit" className="button button-primary" disabled={busy || name.trim() === m.username}><PsSymbol shape="cross" />{tr(' Renommer')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function BanDialog({ member: m, onClose, onDone }: ActionProps) {
  const [duration, setDuration] = useState('7');
  const [reason, setReason] = useState('');
  const { busy, error, send } = useAction(onClose, onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const days = duration === 'none' ? null : Number(duration);
    send(() => supabase.rpc('admin_ban_member', { target: m.id, days, reason: reason.trim() || null }));
  }
  return (
    <Dialog open onClose={onClose} title={tr('Suspendre {0}', m.username)}>
      <form onSubmit={submit} className="form">
        <p className="muted">{tr('Le compte est déconnecté de tous ses appareils et ne peut plus se connecter ni contribuer pendant la suspension. Sa collection et ses contributions sont gardées. Tu peux lever la suspension à tout moment.')}</p>
        <label className="field">
          <span className="field-label">{tr('Durée')}</span>
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {BAN_DURATIONS.map((d) => <option key={d.label} value={d.days ?? 'none'}>{d.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{tr('Raison (visible des admins seulement)')}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder={tr('Ex. : propositions fantaisistes à répétition')} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button" onClick={onClose}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
          <button type="submit" className="button button-danger" disabled={busy}><PsSymbol shape="square" />{tr(' Suspendre')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ member: m, onClose, onDone }: ActionProps) {
  const [typed, setTyped] = useState('');
  const { busy, error, send } = useAction(onClose, onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    send(async () => {
      // Images envoyées avec ses propositions (son dossier du stockage), comme « Supprimer mon compte »
      const { data: files } = await supabase.storage.from('submission-images').list(m.id, { limit: 1000 });
      if (files?.length) await supabase.storage.from('submission-images').remove(files.map((f) => `${m.id}/${f.name}`));
      await removeAvatarFolder(m.id);
      return supabase.rpc('admin_delete_member', { target: m.id, confirmation: typed.trim() });
    });
  }
  return (
    <Dialog open onClose={onClose} title={tr('Supprimer le compte de {0}', m.username)}>
      <form onSubmit={submit} className="form">
        <p>{tr('Suppression définitive : compte, profil, collection, propositions en attente et images envoyées. Ses propositions déjà traitées et ses signalements restent, sans nom d’auteur.')}</p>
        <label className="field">
          <span className="field-label">{tr('Pour confirmer, tape son pseudo : {0}', m.username)}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus="" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="button" onClick={onClose}><PsSymbol shape="circle" />{tr(' Annuler')}</button>
          <button type="submit" className="button button-danger" disabled={busy || typed.trim() !== m.username}><PsSymbol shape="cross" />{tr(' Supprimer définitivement')}</button>
        </div>
      </form>
    </Dialog>
  );
}
