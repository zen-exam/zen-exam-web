import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Header, type NavItem } from './components/common/Header';
import { Login } from './components/common/Login';
import { StudentHome } from './components/student/StudentHome';
import { ExamSession } from './components/student/ExamSession';
import { ResultView } from './components/student/ResultView';
import { TeacherHome } from './components/teacher/TeacherHome';
import { AddTest } from './components/teacher/AddTest';
import { TestEditor } from './components/teacher/TestEditor';
import { AttemptsReview } from './components/teacher/AttemptsReview';
import { Accounts } from './components/admin/Accounts';
import type { ExamAttempt, Role, TestDefinition, User } from './shared/exam';
import { api, SIGNED_OUT_EVENT } from './services/api';

type View =
  | { name: 'practice' }
  | { name: 'exam'; testId: string }
  | { name: 'result'; attemptId: string }
  | { name: 'tests' }
  | { name: 'add' }
  | { name: 'edit'; testId: string }
  | { name: 'attempts'; testId: string }
  | { name: 'accounts' };

// What each account type may open. The server enforces the same rules; this only decides what to render.
const ALLOWED: Record<Role, View['name'][]> = {
  student: ['practice', 'exam', 'result'],
  teacher: ['tests', 'add', 'edit', 'attempts', 'exam'],
  admin: ['tests', 'add', 'edit', 'attempts', 'exam', 'accounts'],
};
const HOME: Record<Role, View> = { student: { name: 'practice' }, teacher: { name: 'tests' }, admin: { name: 'tests' } };
const NAV: Record<Role, NavItem[]> = {
  student: [{ id: 'practice', label: 'Practice' }],
  teacher: [{ id: 'tests', label: 'Tests' }],
  admin: [
    { id: 'tests', label: 'Tests' },
    { id: 'accounts', label: 'Accounts' },
  ],
};

/** Loads a result from the server: only its owner (or staff) can open it; answers are revealed after submitting. */
const ResultScreen: React.FC<{ attemptId: string; onRetake: (testId: string) => void; onBack: () => void }> = ({ attemptId, onRetake, onBack }) => {
  const [data, setData] = useState<{ attempt: ExamAttempt; test: TestDefinition } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getAttempt(attemptId).then(setData, (e: Error) => setError(e.message));
  }, [attemptId]);
  if (error) return <div className="page muted">{error}</div>;
  if (!data) return <div className="page muted">Loading your result…</div>;
  return <ResultView test={data.test} attempt={data.attempt} onRetake={() => onRetake(data.test.id)} onBack={onBack} />;
};

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = still checking the session
  const [view, setView] = useState<View>({ name: 'practice' });
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [toast, setToast] = useState<{ text: string } | null>(null);

  const refresh = useCallback(async (u: User) => {
    const [t, a] = await Promise.all([api.listTests(), u.role === 'student' ? api.myAttempts() : Promise.resolve([])]);
    setTests(t);
    setAttempts(a);
  }, []);

  const signIn = useCallback(
    (u: User) => {
      setUser(u);
      setView(HOME[u.role]);
      refresh(u);
    },
    [refresh]
  );

  useEffect(() => {
    api.me().then(signIn, () => setUser(null));
    const onSignedOut = () => setUser(null); // session expired or account disabled
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [signIn]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (user === undefined) return null;
  if (user === null) return <Login onSignedIn={signIn} />;

  const allowed = (v: View) => ALLOWED[user.role].includes(v.name);
  const go = (v: View) => setView(allowed(v) ? v : HOME[user.role]);
  const current = allowed(view) ? view : HOME[user.role];
  const findTest = (id: string) => tests.find((t) => t.id === id);
  const isStaff = user.role !== 'student';

  const backToTests = async (message?: string) => {
    await refresh(user);
    go({ name: 'tests' });
    if (message) setToast({ text: message });
  };

  const finishExam = async (attempt: ExamAttempt) => {
    if (isStaff) {
      // Teacher/admin preview: scored locally, never saved
      go({ name: 'tests' });
      setToast({ text: `Preview finished: ${attempt.rawScore}/${attempt.maxScore} correct` });
      return;
    }
    const saved = await api.submitAttempt(attempt.testId, attempt.answers, attempt.durationSeconds); // server scores it
    setAttempts(await api.myAttempts());
    go({ name: 'result', attemptId: saved.id });
  };

  let content: React.ReactNode = null;
  switch (current.name) {
    case 'practice':
      content = (
        <StudentHome
          tests={tests}
          attempts={attempts}
          onStart={(testId) => go({ name: 'exam', testId })}
          onReview={(attemptId) => go({ name: 'result', attemptId })}
        />
      );
      break;
    case 'exam': {
      const test = findTest(current.testId);
      content = test && (
        <ExamSession test={test} onFinish={finishExam} onExit={() => go(isStaff ? { name: 'tests' } : { name: 'practice' })} />
      );
      break;
    }
    case 'result':
      content = (
        <ResultScreen
          attemptId={current.attemptId}
          onRetake={(testId) => go({ name: 'exam', testId })}
          onBack={() => go({ name: 'practice' })}
        />
      );
      break;
    case 'tests':
      content = (
        <TeacherHome
          tests={tests}
          onAdd={() => go({ name: 'add' })}
          onEdit={(testId) => go({ name: 'edit', testId })}
          onPreview={(testId) => go({ name: 'exam', testId })}
          onAttempts={(testId) => go({ name: 'attempts', testId })}
          onDelete={async (t) => {
            await api.deleteTest(t.id);
            await backToTests(`Deleted "${t.title}"`);
          }}
        />
      );
      break;
    case 'add':
      content = <AddTest onSaved={backToTests} onCancel={() => backToTests()} />;
      break;
    case 'edit': {
      const test = findTest(current.testId);
      content = test && <TestEditor tests={[test]} onSaved={backToTests} onBack={() => backToTests()} />;
      break;
    }
    case 'attempts': {
      const test = findTest(current.testId);
      content = test && <AttemptsReview test={test} onBack={() => backToTests()} />;
      break;
    }
    case 'accounts':
      content = <Accounts me={user} />;
      break;
  }

  const activeNav = current.name === 'result' ? 'practice' : ['add', 'edit', 'attempts', 'exam'].includes(current.name) ? 'tests' : current.name;

  return (
    <>
      {current.name !== 'exam' && (
        <Header
          user={user}
          nav={NAV[user.role]}
          active={activeNav}
          onNavigate={(id) => go({ name: id } as View)}
          onSignOut={async () => {
            await api.logout().catch(() => {});
            setUser(null);
            setTests([]);
            setAttempts([]);
          }}
        />
      )}
      <main>{content ?? <div className="page muted">This item is no longer available.</div>}</main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} aria-hidden />
          {toast.text}
        </div>
      )}
    </>
  );
};

export default App;
