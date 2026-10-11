import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, FileImage, CheckCircle2, XCircle } from 'lucide-react';
import type { ExamAttempt, TestDefinition } from '../../shared/exam';
import { isAnswerCorrect, isAutoGraded } from '../../shared/grading';
import { assetUrl } from '../../services/api';
import { Modal, SkillBadge } from '../common/ui';
import { answerList, formatDate, formatDuration, sectionLabel } from '../common/format';
import { t } from '../../i18n';

const bandWord = (band: number) =>
  t(band >= 8.5 ? 'band.expert' : band >= 7 ? 'band.good' : band >= 6 ? 'band.competent' : band >= 5 ? 'band.modest' : band >= 4 ? 'band.limited' : 'band.practise');

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
        <ArrowLeft size={16} /> {t('result.allTests')}
      </button>

      <div className="card score-hero">
        {graded ? (
          <div className="band-circle" aria-label={t('common.band', { band: attempt.bandScore.toFixed(1) })}>
            <div>
              <strong>{attempt.bandScore.toFixed(1)}</strong>
              <span>{t('common.bandShort')}</span>
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
                <span>{t('result.correctOf', { raw: attempt.rawScore, max: attempt.maxScore })}</span>
              </>
            )}
          </div>
          {!graded && <p className="muted">{t('result.teacherReview')}</p>}
        </div>
        <div className="stack-sm">
          <button className="btn btn-primary" onClick={onRetake}>
            <RotateCcw size={16} /> {t('common.tryAgain')}
          </button>
          {keyImage && (
            <button className="btn btn-secondary" onClick={() => setShowKey(true)}>
              <FileImage size={16} /> {t('common.answerKey')}
            </button>
          )}
        </div>
      </div>

      <div className="section-title">
        <h2>{t('result.yourAnswers')}</h2>
        <span className="spacer" />
        {graded && (
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyMistakes} onChange={(e) => setOnlyMistakes(e.target.checked)} />
            {t('result.onlyMistakes')}
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
                            <div className="essay-response">{given || <span className="muted">{t('common.noResponse')}</span>}</div>
                          )}
                        </div>
                      </div>
                    );
                  const correct = isAnswerCorrect(q, ans);
                  return (
                    <div key={q.id} className="result-row">
                      <span className="q-num" data-correct={correct} aria-label={correct ? t('result.correct') : t('result.incorrect')}>
                        {q.number}
                      </span>
                      <div>
                        <div className="serif">{q.prompt}</div>
                        <div className="answer-pair">
                          <span>
                            <span className="label">{t('result.you')}</span>
                            {given ? <span className={correct ? 'right' : 'wrong'}>{given}</span> : <span className="muted">{t('common.noAnswer')}</span>}
                            {correct ? (
                              <CheckCircle2 size={14} className="right" style={{ marginLeft: 4, verticalAlign: -2 }} aria-hidden />
                            ) : (
                              <XCircle size={14} style={{ marginLeft: 4, verticalAlign: -2, color: 'var(--danger)' }} aria-hidden />
                            )}
                          </span>
                          {!correct && (
                            <span>
                              <span className="label">{t('result.correctLabel')}</span>
                              <span className="right">{answerList(q.correctAnswer).join(' / ')}</span>
                            </span>
                          )}
                          {ans?.manualOverrideStatus && <span className="badge">{t('result.adjusted')}</span>}
                        </div>
                        {(q.explanation || q.passageAnchor) && (
                          <details className="disclosure" style={{ marginTop: 8 }}>
                            <summary>{t('result.why')}</summary>
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
            <CheckCircle2 size={16} /> {t('result.noMistakes')}
          </div>
        )}
      </div>

      {showKey && keyImage && (
        <Modal title={t('result.officialKey')} wide onClose={() => setShowKey(false)}>
          <img src={assetUrl(keyImage)} alt={t('result.officialKey')} />
        </Modal>
      )}
    </div>
  );
};
