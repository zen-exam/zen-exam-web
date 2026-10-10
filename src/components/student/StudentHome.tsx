import React, { useState } from 'react';
import { Clock, FileQuestion, Inbox, ArrowRight } from 'lucide-react';
import type { ExamAttempt, TestDefinition } from '../../shared/exam';
import { EmptyState, SkillBadge } from '../common/ui';
import { formatDate } from '../common/format';

const SKILLS: TestDefinition['skill'][] = ['Listening', 'Reading', 'Writing', 'Speaking'];

export const StudentHome: React.FC<{
  tests: TestDefinition[];
  attempts: ExamAttempt[];
  onStart: (testId: string) => void;
  onReview: (attemptId: string) => void;
}> = ({ tests, attempts, onStart, onReview }) => {
  const [skill, setSkill] = useState<TestDefinition['skill'] | 'All'>('All');
  const available = SKILLS.filter((s) => tests.some((t) => t.skill === s));
  const shown = skill === 'All' ? tests : tests.filter((t) => t.skill === skill);
  const testIds = new Set(tests.map((t) => t.id));
  const recent = attempts.filter((a) => testIds.has(a.testId)).slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Practice tests</h1>
          <p className="subtitle">Pick a test, answer under real exam timing, then see your band score and every answer explained.</p>
        </div>
      </div>

      {available.length > 1 && (
        <div className="chips" role="group" aria-label="Filter by skill" style={{ marginBottom: 16 }}>
          {(['All', ...available] as const).map((s) => (
            <button key={s} className="chip" aria-pressed={skill === s} onClick={() => setSkill(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={<Inbox size={36} />} title="No tests yet">
          Your teacher hasn't published any tests. Check back soon.
        </EmptyState>
      ) : (
        <div className="card-grid">
          {shown.map((t) => {
            const mine = attempts.filter((a) => a.testId === t.id);
            const best = mine.length ? Math.max(...mine.map((a) => a.bandScore)) : null;
            const graded = t.skill === 'Listening' || t.skill === 'Reading';
            return (
              <article key={t.id} className="card test-card">
                <div className="row">
                  <SkillBadge skill={t.skill} />
                  {mine.length > 0 && <span className="badge">Taken {mine.length}×</span>}
                </div>
                <h3>{t.title}</h3>
                <div className="meta">
                  <span>
                    <FileQuestion size={14} aria-hidden /> {t.totalQuestions} {t.skill === 'Writing' ? 'tasks' : 'questions'}
                  </span>
                  <span>
                    <Clock size={14} aria-hidden /> {t.timeLimitMinutes} min
                  </span>
                </div>
                {best !== null && graded && (
                  <p className="last-result">
                    Best result: <strong>Band {best.toFixed(1)}</strong>
                  </p>
                )}
                <div className="foot">
                  <button className="btn btn-primary" onClick={() => onStart(t.id)}>
                    {mine.length ? 'Take again' : 'Start test'}
                  </button>
                  {mine.length > 0 && (
                    <button className="btn btn-ghost" onClick={() => onReview(mine[0].id)}>
                      Last result
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-title">
            <h2>Your recent results</h2>
          </div>
          <div className="list">
            {recent.map((a) => (
              <button key={a.id} className="list-row" onClick={() => onReview(a.id)}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{a.testTitle}</div>
                  <div className="sub">
                    <span>{formatDate(a.endTime ?? a.startTime)}</span>
                    <span>
                      {a.rawScore}/{a.maxScore} correct
                    </span>
                  </div>
                </div>
                <div className="actions">
                  {a.maxScore > 0 && <span className="badge badge-reading">Band {a.bandScore.toFixed(1)}</span>}
                  <ArrowRight size={16} className="muted" aria-hidden />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
