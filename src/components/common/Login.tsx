import React, { useState } from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';
import type { User } from '../../shared/exam';
import { api } from '../../services/api';
import { t } from '../../i18n';
import { LangSwitch } from './ui';

// ponytail: public demo accounts on purpose (requested); remove before real students use the app
const DEMO = [
  { role: 'admin' as const, email: 'admin@zenexam.local', password: 'demo-admin-123' },
  { role: 'teacher' as const, email: 'teacher@zenexam.local', password: 'demo-teacher-123' },
  { role: 'student' as const, email: 'student@zenexam.local', password: 'demo-student-123' },
];

export const Login: React.FC<{ onSignedIn: (user: User) => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-lang">
        <LangSwitch />
      </div>
      <form className="card login-card stack" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-mark">
            <BookOpen size={18} aria-hidden />
          </span>
          ZenExam IELTS
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>{t('login.title')}</h1>
          <p className="muted small">{t('login.subtitle')}</p>
        </div>
        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        <label className="field">
          <span className="label">{t('common.email')}</span>
          <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">{t('common.password')}</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? t('login.signingIn') : t('login.title')}
        </button>
        <div className="stack" style={{ gap: 6 }}>
          <span className="hint" style={{ textAlign: 'center' }}>{t('login.demoAccounts')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {DEMO.map((d) => (
              <button
                key={d.role}
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                {t(`role.${d.role}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="hint" style={{ textAlign: 'center' }}>
          {t('login.forgot')}
        </p>
      </form>
    </div>
  );
};
