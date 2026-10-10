import React, { useState } from 'react';
import { BookOpen, AlertTriangle } from 'lucide-react';
import type { User } from '../../shared/exam';
import { api } from '../../services/api';

// ponytail: public demo accounts on purpose (requested); remove before real students use the app
const DEMO = [
  { role: 'Admin', email: 'admin@zenexam.local', password: 'demo-admin-123' },
  { role: 'Teacher', email: 'teacher@zenexam.local', password: 'demo-teacher-123' },
  { role: 'Student', email: 'student@zenexam.local', password: 'demo-student-123' },
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
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card stack" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-mark">
            <BookOpen size={18} aria-hidden />
          </span>
          ZenExam IELTS
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22 }}>Sign in</h1>
          <p className="muted small">Use the account your school gave you.</p>
        </div>
        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
        <label className="field">
          <span className="label">Email</span>
          <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="stack" style={{ gap: 6 }}>
          <span className="hint" style={{ textAlign: 'center' }}>Demo accounts</span>
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
                {d.role}
              </button>
            ))}
          </div>
        </div>
        <p className="hint" style={{ textAlign: 'center' }}>
          Forgot your password? Ask your school's administrator to reset it.
        </p>
      </form>
    </div>
  );
};
