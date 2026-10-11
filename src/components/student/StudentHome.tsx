import React, { useState } from 'react';
import { Clock, FileQuestion, Inbox, ArrowRight } from 'lucide-react';
import type { ExamAttempt, TestDefinition } from '../../shared/exam';
import { EmptyState, SkillBadge } from '../common/ui';
import { formatDate } from '../common/format';
import { t, tNode } from '../../i18n';

const SKILLS: TestDefinition['skill'][] = ['Listening', 'Reading', 'Writing', 'Speaking'];

export const StudentHome: React.FC<{
  tests: TestDefinition[];
  attempts: ExamAttempt[];
  onStart: (testId: string) => void;
  onReview: (attemptId: string) => void;
}> = ({ tests, attempts, onStart, onReview }) => {
  const [skill, setSkill] = useState<TestDefinition['skill'] | 'All'>('All');
  const available = SKILLS.filter((s) => tests.some((x) => x.skill === s));
  const shown = skill === 'All' ? tests : tests.filter((x) => x.skill === skill);
  const testIds = new Set(tests.map((x) => x.id));
  const recent = attempts.filter((a) => testIds.has(a.testId)).slice(0, 5);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('home.title')}</h1>
          <p className="subtitle">{t('home.subtitle')}</p>
        </div>
      </div>

      {available.length > 1 && (
        <div className="chips" role="group" aria-label={t('home.filterBySkill')} style={{ marginBottom: 16 }}>
          {(['All', ...available] as const).map((s) => (
            <button key={s} className="chip" aria-pressed={skill === s} onClick={() => setSkill(s)}>
              {s === 'All' ? t('home.all') : t(`skill.${s}`)}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={<Inbox size={36} />} title={t('home.emptyTitle')}>
          {t('home.emptyBody')}
        </EmptyState>
      ) : (
        <div className="card-grid">
          {shown.map((test) => {
            const mine = attempts.filter((a) => a.testId === test.id);
            const best = mine.length ? Math.max(...mine.map((a) => a.bandScore)) : null;
            const graded = test.skill === 'Listening' || test.skill === 'Reading';
            return (
              <article key={test.id} className="card test-card">
                <div className="row">
                  <SkillBadge skill={test.skill} />
                  {mine.length > 0 && <span className="badge">{t('home.taken', { n: mine.length })}</span>}
                </div>
                <h3>{test.title}</h3>
                <div className="meta">
                  <span>
                    <FileQuestion size={14} aria-hidden /> {t(test.skill === 'Writing' ? 'common.tasks' : 'common.questions', { n: test.totalQuestions })}
                  </span>
                  <span>
                    <Clock size={14} aria-hidden /> {t('common.minutes', { n: test.timeLimitMinutes })}
                  </span>
                </div>
                {best !== null && graded && (
                  <p className="last-result">
                    {tNode('home.bestResult', { band: <strong>{t('common.band', { band: best.toFixed(1) })}</strong> })}
                  </p>
                )}
                <div className="foot">
                  <button className="btn btn-primary" onClick={() => onStart(test.id)}>
                    {mine.length ? t('home.takeAgain') : t('home.startTest')}
                  </button>
                  {mine.length > 0 && (
                    <button className="btn btn-ghost" onClick={() => onReview(mine[0].id)}>
                      {t('home.lastResult')}
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
            <h2>{t('home.recent')}</h2>
          </div>
          <div className="list">
            {recent.map((a) => (
              <button key={a.id} className="list-row" onClick={() => onReview(a.id)}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{a.testTitle}</div>
                  <div className="sub">
                    <span>{formatDate(a.endTime ?? a.startTime)}</span>
                    <span>{t('common.correctCount', { raw: a.rawScore, max: a.maxScore })}</span>
                  </div>
                </div>
                <div className="actions">
                  {a.maxScore > 0 && <span className="badge badge-reading">{t('common.band', { band: a.bandScore.toFixed(1) })}</span>}
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
