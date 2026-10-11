import React, { useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Plus, Trash2, AlertTriangle, CheckCircle2, Sparkles, FileImage } from 'lucide-react';
import type { PassageSection, Question, QuestionGroup, QuestionKind, QuestionType, TestDefinition } from '../../shared/exam';
import { validateTest, type AssemblyIssue } from '../../services/examAssembler';
import { isAutoGraded } from '../../shared/grading';
import { api, assetUrl } from '../../services/api';
import { Modal, SkillBadge } from '../common/ui';
import { answerList, sectionLabel } from '../common/format';
import { t, tNode } from '../../i18n';

const KIND_TYPE: Record<QuestionKind, QuestionType> = {
  gap_fill: 'fill_in_the_blank',
  short_answer: 'fill_in_the_blank',
  true_false_not_given: 'true_false_not_given',
  yes_no_not_given: 'yes_no_not_given',
  mcq_single: 'multiple_choice',
  mcq_multi: 'multiple_choice',
  matching: 'matching_headings',
};
// Question types a teacher can pick for an ungrouped question (labels in i18n as type.*)
const PICKABLE_TYPES = ['fill_in_the_blank', 'true_false_not_given', 'yes_no_not_given', 'multiple_choice', 'matching_headings'] as const;

/** Edits as free text; parses on blur so typing "C / " isn't cut short. */
const CommitInput: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
  label: string;
}> = ({ value, onCommit, multiline, rows = 2, className = '', placeholder, label }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const props = {
    value: draft ?? value,
    placeholder,
    'aria-label': label,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => {
      if (draft !== null && draft !== value) onCommit(draft);
      setDraft(null);
    },
  };
  return multiline ? <textarea className={`textarea ${className}`} rows={rows} {...props} /> : <input className={`input ${className}`} {...props} />;
};

/** [1,2,3,5] -> "1–3, 5" */
const ranges = (nums: number[]) =>
  nums
    .sort((x, y) => x - y)
    .reduce<number[][]>((acc, n) => {
      const last = acc[acc.length - 1];
      if (last && n === last[last.length - 1] + 1) last.push(n);
      else acc.push([n]);
      return acc;
    }, [])
    .map((r) => (r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : `${r[0]}`))
    .join(', ');

/** Freshly saved page files can 404 for a moment until Vite's public-folder watcher sees them; retry briefly. */
const PageImage: React.FC<{ src: string; alt: string; zoom: number }> = ({ src: path, alt, zoom }) => {
  const [attempt, setAttempt] = useState(0);
  const src = assetUrl(path);
  return (
    <img
      src={attempt ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src}
      alt={alt}
      style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
      onError={() => attempt < 4 && !src.startsWith('data:') && setTimeout(() => setAttempt((n) => n + 1), 600)}
    />
  );
};

const splitAnswers = (v: string) => v.split('/').map((a) => a.trim()).filter(Boolean);

export const TestEditor: React.FC<{
  tests: TestDefinition[];
  onSaved: (message: string) => void;
  onBack: () => void;
  header?: React.ReactNode;
}> = ({ tests: initial, onSaved, onBack, header }) => {
  const [tests, setTests] = useState(initial);
  const [testIdx, setTestIdx] = useState(0);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const test = tests[testIdx];
  const section = test.sections[sectionIdx] ?? test.sections[0];
  const examPages = test.sourceDocument?.pageImages ?? [];
  const keyImage = test.sourceDocument?.answerKeyImage;
  // The answer key is shown after the exam pages; sourcePage indexes stay valid
  const pages = keyImage ? [...examPages, keyImage] : examPages;
  const onKey = Boolean(keyImage) && page === examPages.length;
  const issues = validateTest(test); // not memoised: messages follow the current language
  const errorsAll = tests.flatMap(validateTest).filter((i) => i.level === 'error');
  // One line each for missing / unanswered questions instead of one per question
  const missing = issues.filter((i) => i.code === 'missing');
  const unanswered = issues.filter((i) => i.code === 'no_answer');
  const summary = (list: AssemblyIssue[], one: 'editor.missingOne' | 'editor.noAnswerOne', many: 'editor.missingMany' | 'editor.noAnswerMany'): AssemblyIssue[] =>
    list.length
      ? [{ ...list[0], message: t(list.length === 1 ? one : many, { n: list.length, list: ranges(list.map((i) => i.questionNumber!)) }) }]
      : [];
  const shownIssues: AssemblyIssue[] = [
    ...summary(missing, 'editor.missingOne', 'editor.missingMany'),
    ...issues.filter((i) => i.level === 'error' && !missing.includes(i)),
    ...summary(unanswered, 'editor.noAnswerOne', 'editor.noAnswerMany'),
    ...issues.filter((i) => i.level === 'warning' && !unanswered.includes(i)),
  ];
  const exists = (n?: number) => n !== undefined && test.sections.some((s) => s.questions.some((q) => q.number === n));
  const allPublished = tests.every((t) => t.status === 'published');

  const mutate = (fn: (t: TestDefinition) => void) => {
    setTests((prev) =>
      prev.map((t, i) => {
        if (i !== testIdx) return t;
        const copy = structuredClone(t);
        fn(copy);
        copy.totalQuestions = copy.sections.reduce((n, s) => n + s.questions.length, 0);
        return copy;
      })
    );
    setDirty(true);
    setSavedNote(false);
  };
  const mutateSection = (fn: (s: PassageSection) => void) => mutate((t) => fn(t.sections[sectionIdx]));
  const mutateGroup = (groupId: string, fn: (g: QuestionGroup, s: PassageSection) => void) =>
    mutateSection((s) => {
      const g = s.groups?.find((x) => x.id === groupId);
      if (g) fn(g, s);
    });
  const mutateQuestion = (n: number, fn: (q: Question) => void) =>
    mutateSection((s) => {
      const q = s.questions.find((x) => x.number === n);
      if (q) fn(q);
    });

  const goToIssue = (issue: AssemblyIssue) => {
    if (issue.questionNumber === undefined) return;
    const idx = test.sections.findIndex((s) => s.questions.some((q) => q.number === issue.questionNumber));
    if (idx !== -1) setSectionIdx(idx);
    requestAnimationFrame(() => {
      const el = document.getElementById(`edit-q-${issue.questionNumber}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const answerIssue = issue.code === 'no_answer' || issue.code === 'bad_answer' || issue.code === 'too_long';
      const field = answerIssue ? `[aria-label="${t('editor.questionAnswer', { n: issue.questionNumber! })}"]` : 'input, textarea';
      (el?.querySelector<HTMLElement>(field) ?? el?.querySelector<HTMLElement>('input, textarea'))?.focus();
    });
  };

  const save = async (publish: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const saved: TestDefinition[] = [];
      for (const t of tests) {
        const status: TestDefinition['status'] = publish ? 'published' : t.status;
        saved.push(await api.saveTest({ ...t, status })); // server stores page images as files and returns the slim copy
      }
      setTests(saved);
      setDirty(false);
      const names = saved.map((x) => t(`skill.${x.skill}`)).join(' & ');
      if (publish) onSaved(t('editor.publishedToast', { names }));
      else if (allPublished) onSaved(t('editor.changesSaved'));
      else setSavedNote(true); // stay in the editor after saving a draft
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (!dirty || window.confirm(t('editor.leaveConfirm'))) onBack();
  };

  const kindOf = (s: PassageSection) => (s.groups?.length ? s.groups : [undefined]);
  const contentLabel = t(`editor.content.${test.skill}`);

  const questionRow = (q: Question, group?: QuestionGroup) => {
    const issue = issues.find((i) => i.questionNumber === q.number && i.level === 'error');
    return (
      <div key={q.id} id={`edit-q-${q.number}`} className="q-edit" data-issue={!!issue}>
        <span className="q-num" title={issue?.message}>
          {q.number}
        </span>
        <div className="stack-sm">
          <div className="q-fields" style={isAutoGraded(q) ? undefined : { gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <CommitInput multiline label={t('editor.questionText', { n: q.number })} value={q.prompt} onCommit={(v) => mutateQuestion(q.number, (x) => (x.prompt = v))} />
            {isAutoGraded(q) && (
              <div className="field">
                <CommitInput
                  label={t('editor.questionAnswer', { n: q.number })}
                  placeholder={t('editor.correctAnswer')}
                  value={answerList(q.correctAnswer).join(' / ')}
                  onCommit={(v) =>
                    mutateQuestion(q.number, (x) => {
                      x.correctAnswer = splitAnswers(v);
                      x.needsReview = false;
                    })
                  }
                />
                {q.needsReview && (
                  <span className="badge badge-warning" title={q.explanation}>
                    <Sparkles size={11} aria-hidden /> {t('editor.aiCheck')}
                  </span>
                )}
              </div>
            )}
            <button className="icon-btn" aria-label={t('editor.deleteQuestion', { n: q.number })} title={t('editor.deleteQuestionTitle')} onClick={() => mutateSection((s) => (s.questions = s.questions.filter((x) => x.number !== q.number)))}>
              <Trash2 size={16} />
            </button>
          </div>
          {!group && isAutoGraded(q) && (
            <select className="select" style={{ maxWidth: 260 }} value={q.type} aria-label={t('editor.questionType', { n: q.number })} onChange={(e) => mutateQuestion(q.number, (x) => (x.type = e.target.value as QuestionType))}>
              {PICKABLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {t(`type.${v}`)}
                </option>
              ))}
            </select>
          )}
          {q.type === 'multiple_choice' && group?.kind !== 'mcq_multi' && (
            <CommitInput
              multiline
              rows={4}
              label={t('editor.questionOptions', { n: q.number })}
              placeholder={t('editor.optionsPlaceholder')}
              value={(q.options ?? []).join('\n')}
              onCommit={(v) => mutateQuestion(q.number, (x) => (x.options = v.split('\n').map((o) => o.trim()).filter(Boolean)))}
            />
          )}
          {issue && <span className="small" style={{ color: 'var(--danger)' }}>{issue.message}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <button className="back-link" onClick={leave}>
        <ArrowLeft size={16} /> {t('teacher.title')}
      </button>
      {header}

      <div className="editor-bar">
        <SkillBadge skill={test.skill} />
        <input
          className="input input-title"
          style={{ flex: 1, minWidth: 200 }}
          value={test.title}
          aria-label={t('editor.testTitle')}
          onChange={(e) => mutate((t) => (t.title = e.target.value))}
        />
        {dirty && <span className="muted small">{t('editor.unsaved')}</span>}
        {savedNote && !dirty && <span className="small" style={{ color: 'var(--success)' }}>{t('editor.draftSaved')}</span>}
        {allPublished ? (
          <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>
            {t('editor.saveChanges')}
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>
              {t('editor.saveDraft')}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={() => (errorsAll.length ? setConfirmPublish(true) : save(true))}>
              {tests.length > 1 ? t('editor.publishN', { n: tests.length }) : t('editor.publish')}
            </button>
          </>
        )}
      </div>

      {tests.length > 1 && (
        <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
          {tests.map((x, i) => (
            <button
              key={x.id}
              role="tab"
              className="tab"
              aria-selected={i === testIdx}
              onClick={() => {
                setTestIdx(i);
                setSectionIdx(0);
              }}
            >
              {t(`skill.${x.skill}`)} <span className="muted">({x.totalQuestions})</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} /> {t('editor.saveError', { error })}
          </div>
        )}
        {issues.length ? (
          <div className={`alert ${issues.some((i) => i.level === 'error') ? 'alert-warning' : 'alert-info'}`}>
            <AlertTriangle size={16} />
            <div>
              <strong>{shownIssues.length === 1 ? t('editor.toCheckOne') : t('editor.toCheckMany', { n: shownIssues.length })}</strong>
              <ul className="issue-list">
                {shownIssues.slice(0, 8).map((i, k) => (
                  <li key={k}>{exists(i.questionNumber) ? <button onClick={() => goToIssue(i)}>{i.message}</button> : i.message}</li>
                ))}
                {shownIssues.length > 8 && <li>{t('editor.more', { n: shownIssues.length - 8 })}</li>}
              </ul>
            </div>
          </div>
        ) : (
          <div className="alert alert-success">
            <CheckCircle2 size={16} /> {t('editor.allGood')}
          </div>
        )}
      </div>

      {test.sections.length > 1 && (
        <div className="tabs" role="tablist" style={{ marginTop: 16 }}>
          {test.sections.map((s, i) => (
            <button key={s.id} role="tab" className="tab" aria-selected={i === sectionIdx} onClick={() => setSectionIdx(i)}>
              {sectionLabel(test.skill, s.sectionNumber)}
              <span className="muted">({s.questions.length})</span>
            </button>
          ))}
        </div>
      )}

      <div className="editor" style={pages.length ? undefined : { gridTemplateColumns: '1fr' }}>
        {pages.length > 0 && (
          <aside className="page-viewer" aria-label={t('editor.originalPages')}>
            <div className="row">
              <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t('editor.prevPage')}>
                <ChevronLeft size={18} />
              </button>
              <span className="small">{onKey ? t('common.answerKey') : t('editor.pageOf', { n: page + 1, total: examPages.length })}</span>
              <button className="icon-btn" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)} aria-label={t('editor.nextPage')}>
                <ChevronRight size={18} />
              </button>
              <span className="spacer" />
              {keyImage && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(onKey ? 0 : examPages.length)}>
                  {onKey ? t('editor.examPages') : t('common.answerKey')}
                </button>
              )}
              <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label={t('editor.zoomOut')}>
                <ZoomOut size={16} />
              </button>
              <button className="icon-btn" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label={t('editor.zoomIn')}>
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="frame">
              <PageImage key={pages[page]} src={pages[page]} alt={onKey ? t('common.answerKey') : t('editor.originalPage', { n: page + 1 })} zoom={zoom} />
            </div>
          </aside>
        )}

        <div className="stack">
          <div className="card card-body stack">
            <div className="field">
              <span className="label">{t('editor.sectionTitle', { section: sectionLabel(test.skill, section.sectionNumber) })}</span>
              <CommitInput label={t('editor.sectionTitleAria')} value={section.title} onCommit={(v) => mutateSection((s) => (s.title = v))} />
            </div>
            {section.figureImage && (
              <div className="row small muted">
                <FileImage size={14} /> {t('editor.hasFigure')}
              </div>
            )}
            <details className="disclosure" open={test.skill === 'Writing' || test.skill === 'Speaking'}>
              <summary>
                {t('editor.wordCount', { label: contentLabel, n: section.content.trim() ? section.content.trim().split(/\s+/).length : 0 })}
              </summary>
              <CommitInput multiline rows={12} className="serif" label={contentLabel} value={section.content} onCommit={(v) => mutateSection((s) => (s.content = v))} />
            </details>
          </div>

          {kindOf(section).map((group, gi) => {
            const questions = group ? section.questions.filter((q) => q.groupId === group.id) : section.questions.filter((q) => !q.groupId || !section.groups?.length);
            if (!group && !questions.length) return null;
            return (
              <div
                key={group?.id ?? gi}
                className="card group-card"
                onFocusCapture={() => group?.sourcePage !== undefined && setPage(group.sourcePage)}
              >
                {group ? (
                  <>
                    <div className="group-head">
                      <h3>{t('common.questionsRange', { range: `${group.range[0]}–${group.range[1]}` })}</h3>
                      <select
                        className="select"
                        style={{ width: 'auto' }}
                        value={group.kind}
                        aria-label={t('editor.questionTypeAria')}
                        onChange={(e) =>
                          mutateGroup(group.id, (g, s) => {
                            g.kind = e.target.value as QuestionKind;
                            s.questions.filter((q) => q.groupId === g.id).forEach((q) => (q.type = KIND_TYPE[g.kind]));
                          })
                        }
                      >
                        {(Object.keys(KIND_TYPE) as QuestionKind[]).map((v) => (
                          <option key={v} value={v}>
                            {t(`kind.${v}`)}
                          </option>
                        ))}
                      </select>
                      <span className="spacer" />
                      {group.sourcePage !== undefined && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setPage(group.sourcePage!)}>
                          {t('editor.showPage', { n: group.sourcePage + 1 })}
                        </button>
                      )}
                    </div>
                    <div className="field">
                      <span className="label">{t('editor.instructions')}</span>
                      <CommitInput multiline label={t('editor.instructions')} value={group.instructions} onCommit={(v) => mutateGroup(group.id, (g) => (g.instructions = v))} />
                    </div>
                    {(group.kind === 'matching' || group.kind === 'mcq_multi' || group.options?.length) && (
                      <div className="field">
                        <span className="label">{t('editor.groupOptions')}</span>
                        <CommitInput
                          multiline
                          rows={Math.min(10, (group.options?.length ?? 0) + 1)}
                          label={t('editor.groupOptionsAria')}
                          placeholder={t('editor.groupOptionsPlaceholder')}
                          value={(group.options ?? []).map((o) => `${o.key} ${o.text}`).join('\n')}
                          onCommit={(v) =>
                            mutateGroup(group.id, (g, s) => {
                              g.options = v
                                .split('\n')
                                .map((l) => l.trim().match(/^(\S+?)[.)]?\s+(.+)$/))
                                .filter((m): m is RegExpMatchArray => !!m)
                                .map((m) => ({ key: m[1], text: m[2] }));
                              s.questions.filter((q) => q.groupId === g.id).forEach((q) => (q.options = g.options!.map((o) => `${o.key}. ${o.text}`)));
                            })
                          }
                        />
                      </div>
                    )}
                    {group.context !== undefined && (
                      <details className="disclosure">
                        <summary>{t('editor.notes')}</summary>
                        <CommitInput multiline rows={8} className="serif" label={t('editor.notesAria')} value={group.context} onCommit={(v) => mutateGroup(group.id, (g) => (g.context = v))} />
                      </details>
                    )}
                  </>
                ) : (
                  test.skill !== 'Writing' && test.skill !== 'Speaking' && <h3>{t('common.questionsHeading')}</h3>
                )}

                {questions.map((q) => questionRow(q, group))}

                <div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      mutateSection((s) => {
                        const n = Math.max(0, ...test.sections.flatMap((x) => x.questions.map((q) => q.number))) + 1;
                        const type = group ? KIND_TYPE[group.kind] : test.skill === 'Writing' ? 'essay' : test.skill === 'Speaking' ? 'speaking' : 'fill_in_the_blank';
                        s.questions.push({
                          id: `q_${n}`,
                          number: n,
                          type,
                          prompt: '',
                          correctAnswer: [],
                          points: isAutoGraded({ type }) ? 1 : 0,
                          groupId: group?.id,
                          options: group?.options?.map((o) => `${o.key}. ${o.text}`),
                        });
                        const g = s.groups?.find((x) => x.id === group?.id);
                        if (g) g.range[1] = Math.max(g.range[1], n);
                        s.questions.sort((a, b) => a.number - b.number);
                      })
                    }
                  >
                    <Plus size={15} /> {t('editor.addQuestion')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmPublish && (
        <Modal
          title={t('editor.publishProblemsTitle')}
          onClose={() => setConfirmPublish(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmPublish(false)}>
                {t('editor.goFix')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmPublish(false);
                  save(true);
                }}
              >
                {t('editor.publishAnyway')}
              </button>
            </>
          }
        >
          {tNode(errorsAll.length === 1 ? 'editor.problemsOne' : 'editor.problemsMany', { n: errorsAll.length, example: <em>{errorsAll[0]?.message}</em> })}
        </Modal>
      )}
    </div>
  );
};
