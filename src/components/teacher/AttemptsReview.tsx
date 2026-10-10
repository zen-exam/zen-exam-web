import React, { useEffect, useState } from 'react';
import { ArrowLeft, Users, AlertTriangle } from 'lucide-react';
import type { ExamAttempt, StudentAnswer, TestDefinition } from '../../shared/exam';
import { gradeAnswer, isAutoGraded } from '../../shared/grading';
import { api } from '../../services/api';
import { EmptyState, SkillBadge } from '../common/ui';
import { answerList, formatDate, formatDuration, sectionLabel } from '../common/format';

type Override = StudentAnswer['manualOverrideStatus'];

export const AttemptsReview: React.FC<{ test: TestDefinition; onBack: () => void }> = ({ test, onBack }) => {
  const [attempts, setAttempts] = useState<ExamAttempt[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const attempt = attempts?.find((a) => a.id === selectedId);

  useEffect(() => {
    api.testAttempts(test.id).then(
      (list) => {
        setAttempts(list);
        setSelectedId(list[0]?.id);
      },
      (e: Error) => setError(e.message)
    );
  }, [test.id]);

  const setOverride = async (n: number, status: Override) => {
    if (!attempt) return;
    setError(null);
    try {
      const updated = await api.overrideAnswer(attempt.id, n, status); // re-scored on the server
      setAttempts((list) => list?.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page page-narrow">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Tests
      </button>
      <div className="page-header">
        <div>
          <SkillBadge skill={test.skill} />
          <h1 style={{ marginTop: 8 }}>{test.title}</h1>
          <p className="subtitle">Student results. Mark an answer correct or wrong if the automatic marking got it wrong.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {attempts === null ? (
        <p className="muted">Loading results…</p>
      ) : attempts.length === 0 ? (
        <EmptyState icon={<Users size={36} />} title="No results yet">
          Results appear here after students finish this test.
        </EmptyState>
      ) : (
        <div className="stack">
          <div className="list">
            {attempts.map((a) => (
              <button key={a.id} className="list-row" aria-current={a.id === selectedId} onClick={() => setSelectedId(a.id)}>
                <div>
                  <div className="title">{a.studentName ?? 'Student'}</div>
                  <div className="sub">
                    <span>{a.studentEmail}</span>
                    <span>{formatDate(a.endTime ?? a.startTime)}</span>
                    <span>{formatDuration(a.durationSeconds)}</span>
                    {a.maxScore > 0 && (
                      <span>
                        {a.rawScore}/{a.maxScore} correct
                      </span>
                    )}
                  </div>
                </div>
                <div className="actions">{a.maxScore > 0 && <span className="badge badge-reading">Band {a.bandScore.toFixed(1)}</span>}</div>
              </button>
            ))}
          </div>

          {attempt &&
            test.sections.map((section) => (
              <div key={section.id}>
                <h3 className="small muted" style={{ margin: '8px 0' }}>
                  {sectionLabel(test.skill, section.sectionNumber)} · {section.title}
                </h3>
                <div className="list">
                  {section.questions.map((q) => {
                    const ans = attempt.answers[q.number];
                    const given = ans?.answer?.trim();
                    if (!isAutoGraded(q))
                      return (
                        <div key={q.id} className="result-row">
                          <span className="q-num">{q.number}</span>
                          <div>
                            <div className="serif">{q.prompt}</div>
                            {q.type === 'essay' && <div className="essay-response">{given || <span className="muted">No response</span>}</div>}
                          </div>
                        </div>
                      );
                    const auto = gradeAnswer(ans?.answer || '', q.correctAnswer, q.type);
                    const status = ans?.manualOverrideStatus;
                    const correct = status ? status === 'correct' : auto;
                    return (
                      <div key={q.id} className="result-row">
                        <span className="q-num" data-correct={correct}>
                          {q.number}
                        </span>
                        <div>
                          <div className="row" style={{ alignItems: 'flex-start' }}>
                            <div className="serif" style={{ flex: 1 }}>
                              {q.prompt}
                            </div>
                            <div className="override-toggle" role="group" aria-label={`Marking for question ${q.number}`}>
                              <button aria-pressed={!status} onClick={() => setOverride(q.number, null)} title={`Automatic: ${auto ? 'correct' : 'wrong'}`}>
                                Auto
                              </button>
                              <button aria-pressed={status === 'correct'} onClick={() => setOverride(q.number, 'correct')}>
                                Correct
                              </button>
                              <button aria-pressed={status === 'incorrect'} onClick={() => setOverride(q.number, 'incorrect')}>
                                Wrong
                              </button>
                            </div>
                          </div>
                          <div className="answer-pair">
                            <span>
                              <span className="label">Student: </span>
                              {given ? <span className={correct ? 'right' : 'wrong'}>{given}</span> : <span className="muted">No answer</span>}
                            </span>
                            <span>
                              <span className="label">Key: </span>
                              {answerList(q.correctAnswer).join(' / ') || <span className="muted">none</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
