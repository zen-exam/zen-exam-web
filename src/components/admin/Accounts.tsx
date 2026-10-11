import React, { useEffect, useState } from 'react';
import { Plus, Search, KeyRound, UserX, UserCheck, AlertTriangle, Copy } from 'lucide-react';
import type { Role, User } from '../../shared/exam';
import { api } from '../../services/api';
import { Modal } from '../common/ui';
import { formatDate } from '../common/format';
import { t } from '../../i18n';

const ROLES: Role[] = ['student', 'teacher', 'admin'];
const MIN_PASSWORD = 8;

/** Readable temporary password (no look-alike characters). */
const generatePassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join('');
};

const PasswordField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <label className="field">
    <span className="label">{t('accounts.tempPassword')}</span>
    <div className="row">
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" />
      <button type="button" className="btn btn-secondary" onClick={() => onChange(generatePassword())}>
        {t('accounts.generate')}
      </button>
    </div>
    <span className="hint">{t('accounts.passwordHint', { n: MIN_PASSWORD })}</span>
  </label>
);

export const Accounts: React.FC<{ me: User }> = ({ me }) => {
  const [users, setUsers] = useState<User[] | null>(null);
  const [filter, setFilter] = useState<Role | 'all'>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'student' as Role, password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [shared, setShared] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    api.listUsers().then(setUsers, (e: Error) => setError(e.message));
  }, []);

  const replace = (u: User) => setUsers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = (users ?? []).filter(
    (u) => (filter === 'all' || u.role === filter) && `${u.name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const count = (r: Role) => users?.filter((u) => u.role === r).length ?? 0;

  const openAdd = () => {
    setForm({ name: '', email: '', role: 'student', password: generatePassword() });
    setFormError(null);
    setAdding(true);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const u = await api.createUser(form);
      setUsers((list) => [...(list ?? []), u]);
      setAdding(false);
      setShared({ email: u.email, password: form.password });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    setFormError(null);
    try {
      await api.updateUser(resetting.id, { password: form.password });
      setShared({ email: resetting.email, password: form.password });
      setResetting(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('accounts.title')}</h1>
          <p className="subtitle">{t('accounts.subtitle')}</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> {t('accounts.add')}
          </button>
        </div>
      </div>

      <div className="row-wrap" style={{ marginBottom: 16 }}>
        <div className="chips" role="group" aria-label={t('accounts.filterByRole')}>
          <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {t('accounts.all', { n: users?.length ?? 0 })}
          </button>
          {ROLES.map((r) => (
            <button key={r} className="chip" aria-pressed={filter === r} onClick={() => setFilter(r)}>
              {t(`rolePlural.${r}`, { n: count(r) })}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search">
          <Search size={15} aria-hidden />
          <input className="input" placeholder={t('accounts.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('accounts.searchAria')} />
        </label>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {users === null ? (
        <p className="muted">{t('accounts.loading')}</p>
      ) : (
        <div className="list">
          {shown.map((u) => {
            const isMe = u.id === me.id;
            return (
              <div key={u.id} className="list-row" style={u.disabled ? { opacity: 0.6 } : undefined}>
                <span className="avatar" aria-hidden>
                  {u.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row-wrap">
                    <span className="title">{u.name}</span>
                    {isMe && <span className="badge">{t('accounts.you')}</span>}
                    {u.disabled && <span className="badge badge-danger">{t('accounts.disabled')}</span>}
                  </div>
                  <div className="sub">
                    <span>{u.email}</span>
                    <span>{t('common.added', { date: formatDate(u.createdAt) })}</span>
                  </div>
                </div>
                <div className="actions">
                  <select
                    className="select"
                    style={{ width: 'auto' }}
                    value={u.role}
                    disabled={isMe}
                    title={isMe ? t('accounts.ownRole') : undefined}
                    aria-label={t('accounts.roleFor', { name: u.name })}
                    onChange={(e) => run(async () => replace(await api.updateUser(u.id, { role: e.target.value as Role })))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setForm((f) => ({ ...f, password: generatePassword() }));
                      setFormError(null);
                      setResetting(u);
                    }}
                  >
                    <KeyRound size={15} /> {t('accounts.resetPassword')}
                  </button>
                  {!isMe &&
                    (u.disabled ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => run(async () => replace(await api.updateUser(u.id, { disabled: false })))}>
                        <UserCheck size={15} /> {t('accounts.enable')}
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => run(async () => replace(await api.updateUser(u.id, { disabled: true })))}>
                        <UserX size={15} /> {t('accounts.disable')}
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
          {shown.length === 0 && <div className="list-row muted">{t('accounts.noMatch')}</div>}
        </div>
      )}

      {adding && (
        <Modal
          title={t('accounts.add')}
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAdding(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" form="add-account">
                {t('accounts.create')}
              </button>
            </>
          }
        >
          <form id="add-account" className="stack" onSubmit={submitAdd}>
            {formError && (
              <div className="alert alert-danger">
                <AlertTriangle size={16} /> {formError}
              </div>
            )}
            <label className="field">
              <span className="label">{t('accounts.fullName')}</span>
              <input className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">{t('common.email')}</span>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">{t('accounts.role')}</span>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <PasswordField value={form.password} onChange={(password) => setForm({ ...form, password })} />
          </form>
        </Modal>
      )}

      {resetting && (
        <Modal
          title={t('accounts.resetFor', { name: resetting.name })}
          onClose={() => setResetting(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setResetting(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" form="reset-password">
                {t('accounts.resetPassword')}
              </button>
            </>
          }
        >
          <form id="reset-password" className="stack" onSubmit={submitReset}>
            {formError && (
              <div className="alert alert-danger">
                <AlertTriangle size={16} /> {formError}
              </div>
            )}
            <p>{t('accounts.resetNote')}</p>
            <PasswordField value={form.password} onChange={(password) => setForm({ ...form, password })} />
          </form>
        </Modal>
      )}

      {shared && (
        <Modal
          title={t('accounts.shareTitle')}
          onClose={() => setShared(null)}
          footer={
            <button className="btn btn-primary" onClick={() => setShared(null)}>
              {t('accounts.done')}
            </button>
          }
        >
          <p>{t('accounts.shownOnce')}</p>
          <div className="credentials">
            <div>
              <span className="label">{t('common.email')}</span> {shared.email}
            </div>
            <div>
              <span className="label">{t('common.password')}</span> <code>{shared.password}</code>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(t('accounts.copyText', { email: shared.email, password: shared.password }))}>
            <Copy size={14} /> {t('accounts.copy')}
          </button>
        </Modal>
      )}
    </div>
  );
};
