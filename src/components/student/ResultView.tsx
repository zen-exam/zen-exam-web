import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, FileImage, CheckCircle2, XCircle } from 'lucide-react';
import type { ExamAttempt, TestDefinition } from '../../shared/exam';
import { isAnswerCorrect, isAutoGraded } from '../../shared/grading';
import { assetUrl } from '../../services/api';
import { Modal, SkillBadge } from '../common/ui';
import { answerList, formatDate, formatDuration, sectionLabel } from '../common/format';

const bandWord = (band: number) =>
  band >= 8.5 ? 'Expert' : band >= 7 ? 'Good' : band >= 6 ? 'Competent' : band >= 5 ? 'Modest' : band >= 4 ? 'Limited' : 'Keep practising';

export const ResultView: React.FC<{
  test: TestDefinition;
  attempt: ExamAttempt;
  onRetake: () => void;
  onBack: () => void;
}> = ({ test, attempt, onRetake, onBack }) => {
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const graded = attempt.maxScore > 0;
  const keyImage = test.sourceDocument?.answerKeyImage;

  return (
    <div className="page page-narrow">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> All tests
      </button>

      <div className="card score-hero">
        {graded ? (
          <div className="band-circle" aria-label={`Band ${attempt.bandScore.toFixed(1)}`}>
            <div>
              <strong>{attempt.bandScore.toFixed(1)}</strong>
              <span>Band</span>
            </div>
          </div>
        ) : (
          <div className="band-circle">
            <CheckCircle2 size={36} />
          </div>
        )}
        <div className="stack-sm" style={{ flex: 1, minWidth: 220 }}>
          <div className="row">
            <SkillBadge skill={test.skill} />
            {graded && <span className="badge">{bandWord(attempt.bandScore)}</span>}
          </div>
          <h1 style={{ fontSize: 22 }}>{test.title}</h1>
          <div className="row-wrap muted small">
            <span>{formatDate(attempt.endTime ?? attempt.startTime)}</span>
            <span>·</span>
            <span>{formatDuration(attempt.durationSeconds)}</span>
            {graded && (
              <>
                <span>·</span>
                <span>
                  {attempt.rawScore} of {attempt.maxScore} correct
                </span>
              </>
            )}
          </div>
          {!graded && <p className="muted">Your responses are saved. Your teacher will review them.</p>}
        </div>
        <div className="stack-sm">
          <button className="btn btn-primary" onClick={onRetake}>
            <RotateCcw size={16} /> Try again
          </button>
          {keyImage && (
            <button className="btn btn-secondary" onClick={() => setShowKey(true)}>
              <FileImage size={16} /> Answer key
            </button>
          )}
        </div>
      </div>

      <div className="section-title">
        <h2>Your answers</h2>
        <span className="spacer" />
        {graded && (
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyMistakes} onChange={(e) => setOnlyMistakes(e.target.checked)} />
            Show only mistakes
          </label>
        )}
      </div>

      <div className="stack">
        {test.sections.map((section) => {
          const rows = section.questions.filter(
            (q) => !onlyMistakes || (isAutoGraded(q) && !isAnswerCorrect(q, attempt.answers[q.number]))
          );
          if (!rows.length) return null;
          return (
            <div key={section.id}>
              <h3 className="small muted" style={{ margin: '0 0 8px' }}>
                {sectionLabel(test.skill, section.sectionNumber)} · {section.title}
              </h3>
              <div className="list">
                {rows.map((q) => {
                  const ans = attempt.answers[q.number];
                  const given = ans?.answer?.trim();
                  if (!isAutoGraded(q))
                    return (
                      <div key={q.id} className="result-row">
                        <span className="q-num">{q.number}</span>
                        <div>
                          <div className="serif">{q.prompt}</div>
                          {q.type === 'essay' && (
                            <div className="essay-response">{given || <span className="muted">No response</span>}</div>
                          )}
                        </div>
                      </div>
                    );
                  const correct = isAnswerCorrect(q, ans);
                  return (
                    <div key={q.id} className="result-row">
                      <span className="q-num" data-correct={correct} aria-label={correct ? 'Correct' : 'Incorrect'}>
                        {q.number}
                      </span>
                      <div>
                        <div className="serif">{q.prompt}</div>
                        <div className="answer-pair">
                          <span>
                            <span className="label">You: </span>
                            {given ? <span className={correct ? 'right' : 'wrong'}>{given}</span> : <span className="muted">No answer</span>}
                            {correct ? (
                              <CheckCircle2 size={14} className="right" style={{ marginLeft: 4, verticalAlign: -2 }} aria-hidden />
                            ) : (
                              <XCircle size={14} style={{ marginLeft: 4, verticalAlign: -2, color: 'var(--danger)' }} aria-hidden />
                            )}
                          </span>
                          {!correct && (
                            <span>
                              <span className="label">Correct: </span>
                              <span className="right">{answerList(q.correctAnswer).join(' / ')}</span>
                            </span>
                          )}
                          {ans?.manualOverrideStatus && <span className="badge">Adjusted by teacher</span>}
                        </div>
                        {(q.explanation || q.passageAnchor) && (
                          <details className="disclosure" style={{ marginTop: 8 }}>
                            <summary>Why?</summary>
                            <p className="small muted">
                              {q.passageAnchor && <strong>{q.passageAnchor}: </strong>}
                              {q.explanation}
                            </p>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {onlyMistakes && attempt.rawScore === attempt.maxScore && (
          <div className="alert alert-success">
            <CheckCircle2 size={16} /> No mistakes. Well done!
          </div>
        )}
      </div>

      {showKey && keyImage && (
        <Modal title="Official answer key" wide onClose={() => setShowKey(false)}>
          <img src={assetUrl(keyImage)} alt="Official answer key" />
        </Modal>
      )}
    </div>
  );
};
