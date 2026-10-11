import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, Flag, Highlighter, Eraser, AArrowDown, AArrowUp, AlertTriangle } from 'lucide-react';
import type { ExamAttempt, PassageSection, Question, QuestionGroup, StudentAnswer, TestDefinition } from '../../shared/exam';
import { scoreAttempt } from '../../shared/grading';
import { assetUrl } from '../../services/api';
import { Modal, SkillBadge } from '../common/ui';
import { sectionLabel } from '../common/format';
import { t, tNode } from '../../i18n';

const HIGHLIGHTS = ['#fde68a', '#bbf7d0', '#bfdbfe'];

const formatClock = (sec: number) =>
  `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

/** Legacy tests have no groups: treat each section's questions as one block. */
const groupsOf = (s: PassageSection): Array<{ group?: QuestionGroup; questions: Question[] }> =>
  s.groups?.length
    ? s.groups.map((g) => ({ group: g, questions: s.questions.filter((q) => q.groupId === g.id) }))
    : [{ questions: s.questions }];

export const ExamSession: React.FC<{
  test: TestDefinition;
  onFinish: (attempt: ExamAttempt) => Promise<void>;
  onExit: () => void;
}> = ({ test, onFinish, onExit }) => {
  const [started, setStarted] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, StudentAnswer>>({});
  const [activeQ, setActiveQ] = useState<number>(test.sections[0]?.questions[0]?.number ?? 1);
  const [secondsLeft, setSecondsLeft] = useState(test.timeLimitMinutes * 60);
  const [highlighting, setHighlighting] = useState(false);
  const [color, setColor] = useState(HIGHLIGHTS[0]);
  const [fontSize, setFontSize] = useState(17);
  const [split, setSplit] = useState(50);
  const [confirm, setConfirm] = useState<'submit' | 'exit' | null>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  const section = test.sections[sectionIdx] ?? test.sections[0];
  const allQuestions = test.sections.flatMap((s) => s.questions);
  const hasPassage = test.sections.some((s) => s.content.trim() || s.figureImage);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The local score is only shown for teacher previews; student submissions are scored by the server
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const { rawScore, maxScore, bandScore } = scoreAttempt(test, answers);
    const now = new Date().toISOString();
    await onFinish({
      id: `attempt_${Date.now()}`,
      testId: test.id,
      testTitle: test.title,
      startTime: now,
      endTime: now,
      durationSeconds: Math.max(1, test.timeLimitMinutes * 60 - secondsLeft),
      answers,
      rawScore,
      maxScore,
      bandScore,
      submitted: true,
    }).catch((err: Error) => {
      // Keep the student on the test with their answers intact
      setSubmitError(err.message);
      setConfirm('submit');
      setSubmitting(false);
    });
  };
  // Latest submit for the timer: an interval created at start would otherwise see the empty initial answers
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setTimeout(() => submitRef.current(), 0); // time's up: submit what the student has
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started]);

  const update = (n: number, patch: Partial<StudentAnswer>) =>
    setAnswers((prev) => ({
      ...prev,
      [n]: { ...(prev[n] ?? { questionId: `q_${n}`, questionNumber: n, answer: '' }), ...patch },
    }));

  const goTo = (n: number) => {
    const idx = test.sections.findIndex((s) => s.questions.some((q) => q.number === n));
    if (idx !== -1) setSectionIdx(idx);
    setActiveQ(n);
    requestAnimationFrame(() => document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const highlightSelection = () => {
    const sel = window.getSelection();
    if (!highlighting || !sel || sel.isCollapsed || !passageRef.current?.contains(sel.anchorNode)) return;
    const mark = document.createElement('mark');
    mark.className = 'hl';
    mark.style.backgroundColor = color;
    try {
      sel.getRangeAt(0).surroundContents(mark);
    } catch {
      // ponytail: selections spanning paragraphs can't be wrapped in one <mark>; ignored
    }
    sel.removeAllRanges();
  };

  const clearHighlights = () =>
    passageRef.current?.querySelectorAll('mark.hl').forEach((m) => m.replaceWith(...Array.from(m.childNodes)));

  const startDrag = () => {
    const move = (e: MouseEvent) => setSplit(Math.min(70, Math.max(30, (e.clientX / window.innerWidth) * 100)));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const answered = allQuestions.filter((q) => answers[q.number]?.answer?.trim()).length;
  const flagged = allQuestions.filter((q) => answers[q.number]?.flagged).length;

  if (!started) {
    return (
      <div className="page">
        <button className="back-link" onClick={onExit}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
        <div className="card start-card">
          <SkillBadge skill={test.skill} />
          <h1 style={{ marginTop: 12 }}>{test.title}</h1>
          <div className="facts">
            <div className="stat">
              <strong>{t('common.minutes', { n: test.timeLimitMinutes })}</strong>
              <span>{t('exam.time')}</span>
            </div>
            <div className="stat">
              <strong>{allQuestions.length}</strong>
              <span>{test.skill === 'Writing' ? t('exam.tasks') : t('exam.questions')}</span>
            </div>
            <div className="stat">
              <strong>{test.sections.length}</strong>
              <span>{test.skill === 'Reading' ? t('exam.passages') : t('exam.parts')}</span>
            </div>
          </div>
          <ul className="muted" style={{ textAlign: 'left', margin: '0 auto 24px', maxWidth: 400, paddingLeft: 18 }}>
            <li>{t('exam.rule1')}</li>
            <li>{t('exam.rule2')}</li>
            <li>{t('exam.rule3')}</li>
          </ul>
          <button className="btn btn-primary btn-lg" onClick={() => setStarted(true)}>
            {t('home.startTest')}
          </button>
        </div>
      </div>
    );
  }

  const renderInput = (q: Question) => {
    const value = answers[q.number]?.answer ?? '';
    const set = (v: string) => update(q.number, { answer: v });
    switch (q.type) {
      case 'true_false_not_given':
      case 'yes_no_not_given': {
        const opts = q.type === 'true_false_not_given' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN'];
        return (
          <div className="segmented" role="group" aria-label={t('exam.answerFor', { n: q.number })}>
            {opts.map((o) => (
              <button key={o} aria-pressed={value === o} onClick={() => set(o)}>
                {o}
              </button>
            ))}
          </div>
        );
      }
      case 'multiple_choice':
        return (
          <div className="choice-list">
            {(q.options ?? []).map((opt, i) => {
              const letter = opt.match(/^([A-Z])[.)]/)?.[1] ?? 'ABCDEFGHIJ'[i];
              return (
                <label key={opt} className="choice">
                  <input type="radio" name={`q-${q.number}`} checked={value === letter} onChange={() => set(letter)} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        );
      case 'matching_headings':
        if (q.options?.length)
          return (
            <select className="select answer-input" value={value} onChange={(e) => set(e.target.value)} aria-label={t('exam.answerFor', { n: q.number })}>
              <option value="">{t('exam.chooseAnswer')}</option>
              {q.options.map((opt) => (
                <option key={opt} value={opt.split('.')[0].trim()}>
                  {opt}
                </option>
              ))}
            </select>
          );
        break;
      case 'essay':
        return (
          <div className="stack-sm">
            <textarea
              className="textarea essay-input"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={t('exam.writeHere')}
              aria-label={t('exam.responseFor', { prompt: q.prompt })}
            />
            <span className="hint">{t('exam.words', { n: value.trim() ? value.trim().split(/\s+/).length : 0 })}</span>
          </div>
        );
      case 'speaking':
        return <p className="hint">{t('exam.speakAloud')}</p>;
    }
    return (
      <input
        className="input answer-input"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={t('exam.yourAnswer')}
        aria-label={t('exam.answerFor', { n: q.number })}
      />
    );
  };

  return (
    <div className="exam">
      <header className="exam-top">
        <button className="icon-btn" onClick={() => setConfirm('exit')} aria-label={t('exam.leave')}>
          <ArrowLeft size={18} />
        </button>
        <span className="title">{test.title}</span>
        <span className="spacer" />
        <span className="timer" data-low={secondsLeft < 300} aria-label={t('exam.timeRemaining')}>
          <Clock size={15} aria-hidden /> {formatClock(secondsLeft)}
        </span>
        <button className="btn btn-success" onClick={() => setConfirm('submit')}>
          {t('exam.finish')}
        </button>
      </header>

      <div className="exam-body">
        {hasPassage && (
          <>
            <section className="exam-pane" style={{ width: `${split}%` }} aria-label={t('exam.passage')}>
              <div className="exam-tools">
                {test.sections.length > 1 && (
                  <div className="tabs" role="tablist" style={{ border: 0, marginRight: 8 }}>
                    {test.sections.map((s, i) => (
                      <button
                        key={s.id}
                        role="tab"
                        className="tab"
                        aria-selected={i === sectionIdx}
                        onClick={() => goTo(s.questions[0]?.number ?? activeQ)}
                      >
                        {sectionLabel(test.skill, s.sectionNumber)}
                      </button>
                    ))}
                  </div>
                )}
                <span className="spacer" />
                <button
                  className="icon-btn"
                  aria-pressed={highlighting}
                  onClick={() => setHighlighting((h) => !h)}
                  title={t('exam.highlighterTitle')}
                  aria-label={t('exam.highlighter')}
                >
                  <Highlighter size={16} />
                </button>
                {highlighting &&
                  HIGHLIGHTS.map((c) => (
                    <button
                      key={c}
                      className="swatch"
                      style={{ background: c }}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      aria-label={t('exam.highlightColour')}
                    />
                  ))}
                <button className="icon-btn" onClick={clearHighlights} title={t('exam.removeHighlights')} aria-label={t('exam.removeHighlights')}>
                  <Eraser size={16} />
                </button>
                <button className="icon-btn" onClick={() => setFontSize((f) => Math.max(14, f - 1))} aria-label={t('exam.smallerText')}>
                  <AArrowDown size={16} />
                </button>
                <button className="icon-btn" onClick={() => setFontSize((f) => Math.min(24, f + 1))} aria-label={t('exam.largerText')}>
                  <AArrowUp size={16} />
                </button>
              </div>
              <div
                ref={passageRef}
                className="passage"
                style={{ fontSize }}
                data-highlighting={highlighting}
                onMouseUp={highlightSelection}
              >
                <span className="badge">{sectionLabel(test.skill, section.sectionNumber)}</span>
                <h2>{section.title}</h2>
                {!section.groups?.length && section.instructions && <p className="muted small">{section.instructions}</p>}
                {section.figureImage && <img className="figure" src={assetUrl(section.figureImage)} alt={t('exam.figureAlt')} />}
                {section.content.split('\n\n').map((para, i) => {
                  const tag = para.match(/^(?:\[([A-J])\]|([A-J])\.)\s/);
                  return (
                    <p key={i}>
                      {tag && <span className="para-tag">{tag[1] ?? tag[2]}</span>}
                      {tag ? para.slice(tag[0].length) : para}
                    </p>
                  );
                })}
              </div>
            </section>
            <div className="resizer" onMouseDown={startDrag} role="separator" aria-orientation="vertical" />
          </>
        )}

        <section className="exam-pane qsheet" style={hasPassage ? { width: `${100 - split}%` } : undefined} aria-label={t('exam.questions')}>
          {!hasPassage && test.sections.length > 1 && (
            <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
              {test.sections.map((s, i) => (
                <button key={s.id} role="tab" className="tab" aria-selected={i === sectionIdx} onClick={() => goTo(s.questions[0]?.number ?? activeQ)}>
                  {sectionLabel(test.skill, s.sectionNumber)}
                </button>
              ))}
            </div>
          )}
          {groupsOf(section).map(({ group, questions }, gi) => (
            <div key={group?.id ?? gi} className="qgroup">
              {group && (
                <div className="qgroup-head">
                  <h3>{t('common.questionsRange', { range: group.range[1] !== group.range[0] ? `${group.range[0]}–${group.range[1]}` : group.range[0] })}</h3>
                  {group.instructions && <div className="instructions">{group.instructions.replace(/^Questions?\s+\d+.*\n/i, '')}</div>}
                  {group.kind === 'matching' && group.options && (
                    <div className="context">
                      {group.options.map((o) => (
                        <div key={o.key}>
                          <strong>{o.key}</strong> {o.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {group.context && <div className="context">{group.context}</div>}
                </div>
              )}
              {questions.map((q) => (
                <div key={q.id} id={`q-${q.number}`} className="qcard" data-active={activeQ === q.number} onFocus={() => setActiveQ(q.number)} onClick={() => setActiveQ(q.number)}>
                  <div className="qcard-head">
                    <span className="q-num">{q.number}</span>
                    <div className="qcard-prompt">{q.prompt}</div>
                    {q.type !== 'essay' && q.type !== 'speaking' && (
                      <button
                        className="flag-btn"
                        aria-pressed={!!answers[q.number]?.flagged}
                        onClick={() => update(q.number, { flagged: !answers[q.number]?.flagged })}
                        aria-label={t('exam.flagQuestion', { n: q.number })}
                        title={t('exam.flagTitle')}
                      >
                        <Flag size={16} />
                      </button>
                    )}
                  </div>
                  <div className="qcard-body">{renderInput(q)}</div>
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>

      <nav className="palette" aria-label={t('exam.navigator')}>
        {test.sections.map((s) => (
          <div key={s.id} className="palette-group">
            {test.sections.length > 1 && <span className="label small muted">{sectionLabel(test.skill, s.sectionNumber)}</span>}
            {s.questions.map((q) => (
              <button
                key={q.number}
                className="pal-btn"
                data-answered={!!answers[q.number]?.answer?.trim()}
                data-flagged={!!answers[q.number]?.flagged}
                aria-current={activeQ === q.number}
                onClick={() => goTo(q.number)}
                aria-label={t('exam.questionN', { n: q.number })}
              >
                {q.number}
              </button>
            ))}
          </div>
        ))}
        <div className="palette-legend">
          <span>{t('exam.answered', { n: answered })}</span>
          <span>{t('exam.left', { n: allQuestions.length - answered })}</span>
          {flagged > 0 && <span>{t('exam.flagged', { n: flagged })}</span>}
        </div>
      </nav>

      {confirm === 'submit' && (
        <Modal
          title={t('exam.finishTitle')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>
                {t('exam.keepWorking')}
              </button>
              <button className="btn btn-success" onClick={submit} disabled={submitting}>
                {submitting ? t('exam.submitting') : submitError ? t('common.tryAgain') : t('exam.submitAnswers')}
              </button>
            </>
          }
        >
          {submitError && (
            <div className="alert alert-danger" style={{ marginBottom: 12 }}>
              <AlertTriangle size={16} />
              <span>{t('exam.notSent', { error: submitError })}</span>
            </div>
          )}
          <p>{tNode('exam.answeredOf', { n: <strong>{answered}</strong>, total: <strong>{allQuestions.length}</strong> })}</p>
          {(allQuestions.length - answered > 0 || flagged > 0) && (
            <div className="alert alert-warning" style={{ marginTop: 12 }}>
              <AlertTriangle size={16} />
              <span>
                {allQuestions.length - answered > 0 && `${t('exam.unanswered', { n: allQuestions.length - answered })} `}
                {flagged > 0 && t('exam.flaggedForReview', { n: flagged })}
              </span>
            </div>
          )}
        </Modal>
      )}
      {confirm === 'exit' && (
        <Modal
          title={t('exam.leaveTitle')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>
                {t('exam.stay')}
              </button>
              <button className="btn btn-danger" onClick={onExit}>
                {t('exam.leaveWithoutSaving')}
              </button>
            </>
          }
        >
          {t('exam.notSaved')}
        </Modal>
      )}
    </div>
  );
};
