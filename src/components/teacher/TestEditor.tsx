import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Plus, Trash2, AlertTriangle, CheckCircle2, Sparkles, FileImage } from 'lucide-react';
import type { PassageSection, Question, QuestionGroup, QuestionKind, QuestionType, TestDefinition } from '../../shared/exam';
import { validateTest, type AssemblyIssue } from '../../services/examAssembler';
import { isAutoGraded } from '../../shared/grading';
import { api, assetUrl } from '../../services/api';
import { Modal, SkillBadge } from '../common/ui';
import { answerList, sectionLabel } from '../common/format';

const KIND_LABEL: Record<QuestionKind, string> = {
  gap_fill: 'Gap fill (notes, summary, table)',
  short_answer: 'Short answer',
  true_false_not_given: 'True / False / Not given',
  yes_no_not_given: 'Yes / No / Not given',
  mcq_single: 'Multiple choice (one answer)',
  mcq_multi: 'Multiple choice (choose two or more)',
  matching: 'Matching (headings, features, endings)',
};
const KIND_TYPE: Record<QuestionKind, QuestionType> = {
  gap_fill: 'fill_in_the_blank',
  short_answer: 'fill_in_the_blank',
  true_false_not_given: 'true_false_not_given',
  yes_no_not_given: 'yes_no_not_given',
  mcq_single: 'multiple_choice',
  mcq_multi: 'multiple_choice',
  matching: 'matching_headings',
};
const TYPE_LABEL: Partial<Record<QuestionType, string>> = {
  fill_in_the_blank: 'Gap fill / short answer',
  true_false_not_given: 'True / False / Not given',
  yes_no_not_given: 'Yes / No / Not given',
  multiple_choice: 'Multiple choice',
  matching_headings: 'Matching',
};

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
  const issues = useMemo(() => validateTest(test), [test]);
  const errorsAll = tests.flatMap(validateTest).filter((i) => i.level === 'error');
  // One line each for missing / unanswered questions instead of one per question
  const missing = issues.filter((i) => i.message.endsWith('is missing'));
  const unanswered = issues.filter((i) => i.message.endsWith('has no answer'));
  const summary = (list: AssemblyIssue[], text: string): AssemblyIssue[] =>
    list.length ? [{ ...list[0], message: `${text} (${ranges(list.map((i) => i.questionNumber!))})` }] : [];
  const shownIssues: AssemblyIssue[] = [
    ...summary(missing, `${missing.length} question${missing.length > 1 ? 's are' : ' is'} missing. Upload the pages they're on, or add them`),
    ...issues.filter((i) => i.level === 'error' && !missing.includes(i)),
    ...summary(unanswered, `${unanswered.length} question${unanswered.length > 1 ? 's have' : ' has'} no answer yet`),
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
      const field = issue.message.includes('answer') ? `[aria-label="Question ${issue.questionNumber} answer"]` : 'input, textarea';
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
      const names = saved.map((t) => t.skill).join(' & ');
      if (publish) onSaved(`Published ${names}. Students can take it now.`);
      else if (allPublished) onSaved('Changes saved');
      else setSavedNote(true); // stay in the editor after saving a draft
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (!dirty || window.confirm('Leave without saving your changes?')) onBack();
  };

  const kindOf = (s: PassageSection) => (s.groups?.length ? s.groups : [undefined]);
  const contentLabel = { Reading: 'Passage text', Listening: 'Notes / form text', Writing: 'Task prompt', Speaking: 'Questions' }[test.skill];

  const questionRow = (q: Question, group?: QuestionGroup) => {
    const issue = issues.find((i) => i.questionNumber === q.number && i.level === 'error');
    return (
      <div key={q.id} id={`edit-q-${q.number}`} className="q-edit" data-issue={!!issue}>
        <span className="q-num" title={issue?.message}>
          {q.number}
        </span>
        <div className="stack-sm">
          <div className="q-fields" style={isAutoGraded(q) ? undefined : { gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <CommitInput multiline label={`Question ${q.number} text`} value={q.prompt} onCommit={(v) => mutateQuestion(q.number, (x) => (x.prompt = v))} />
            {isAutoGraded(q) && (
              <div className="field">
                <CommitInput
                  label={`Question ${q.number} answer`}
                  placeholder="Correct answer"
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
                    <Sparkles size={11} aria-hidden /> Worked out by AI — check
                  </span>
                )}
              </div>
            )}
            <button className="icon-btn" aria-label={`Delete question ${q.number}`} title="Delete question" onClick={() => mutateSection((s) => (s.questions = s.questions.filter((x) => x.number !== q.number)))}>
              <Trash2 size={16} />
            </button>
          </div>
          {!group && isAutoGraded(q) && (
            <select className="select" style={{ maxWidth: 260 }} value={q.type} aria-label={`Question ${q.number} type`} onChange={(e) => mutateQuestion(q.number, (x) => (x.type = e.target.value as QuestionType))}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {q.type === 'multiple_choice' && group?.kind !== 'mcq_multi' && (
            <CommitInput
              multiline
              rows={4}
              label={`Question ${q.number} options`}
              placeholder={'One option per line\nA. …\nB. …'}
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
        <ArrowLeft size={16} /> Your tests
      </button>
      {header}

      <div className="editor-bar">
        <SkillBadge skill={test.skill} />
        <input
          className="input input-title"
          style={{ flex: 1, minWidth: 200 }}
          value={test.title}
          aria-label="Test title"
          onChange={(e) => mutate((t) => (t.title = e.target.value))}
        />
        {dirty && <span className="muted small">Unsaved changes</span>}
        {savedNote && !dirty && <span className="small" style={{ color: 'var(--success)' }}>Draft saved</span>}
        {allPublished ? (
          <button className="btn btn-primary" disabled={saving} onClick={() => save(false)}>
            Save changes
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>
              Save draft
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={() => (errorsAll.length ? setConfirmPublish(true) : save(true))}>
              Publish{tests.length > 1 ? ` ${tests.length} tests` : ''}
            </button>
          </>
        )}
      </div>

      {tests.length > 1 && (
        <div className="tabs" role="tablist" style={{ marginTop: 12 }}>
          {tests.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              className="tab"
              aria-selected={i === testIdx}
              onClick={() => {
                setTestIdx(i);
                setSectionIdx(0);
              }}
            >
              {t.skill} <span className="muted">({t.totalQuestions})</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 12 }}>
            <AlertTriangle size={16} /> Couldn't save: {error}
          </div>
        )}
        {issues.length ? (
          <div className={`alert ${issues.some((i) => i.level === 'error') ? 'alert-warning' : 'alert-info'}`}>
            <AlertTriangle size={16} />
            <div>
              <strong>
                {shownIssues.length} {shownIssues.length === 1 ? 'thing' : 'things'} to check
              </strong>
              <ul className="issue-list">
                {shownIssues.slice(0, 8).map((i, k) => (
                  <li key={k}>{exists(i.questionNumber) ? <button onClick={() => goToIssue(i)}>{i.message}</button> : i.message}</li>
                ))}
                {shownIssues.length > 8 && <li>…and {shownIssues.length - 8} more</li>}
              </ul>
            </div>
          </div>
        ) : (
          <div className="alert alert-success">
            <CheckCircle2 size={16} /> Everything checks out: questions are numbered correctly and every answer fits its question.
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
          <aside className="page-viewer" aria-label="Original pages">
            <div className="row">
              <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft size={18} />
              </button>
              <span className="small">{onKey ? 'Answer key' : `Page ${page + 1} of ${examPages.length}`}</span>
              <button className="icon-btn" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight size={18} />
              </button>
              <span className="spacer" />
              {keyImage && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPage(onKey ? 0 : examPages.length)}>
                  {onKey ? 'Exam pages' : 'Answer key'}
                </button>
              )}
              <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label="Zoom out">
                <ZoomOut size={16} />
              </button>
              <button className="icon-btn" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label="Zoom in">
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="frame">
              <PageImage key={pages[page]} src={pages[page]} alt={onKey ? 'Answer key' : `Original page ${page + 1}`} zoom={zoom} />
            </div>
          </aside>
        )}

        <div className="stack">
          <div className="card card-body stack">
            <div className="field">
              <span className="label">{sectionLabel(test.skill, section.sectionNumber)} title</span>
              <CommitInput label="Section title" value={section.title} onCommit={(v) => mutateSection((s) => (s.title = v))} />
            </div>
            {section.figureImage && (
              <div className="row small muted">
                <FileImage size={14} /> This task includes a chart or picture from the paper.
              </div>
            )}
            <details className="disclosure" open={test.skill === 'Writing' || test.skill === 'Speaking'}>
              <summary>
                {contentLabel} ({section.content.trim() ? section.content.trim().split(/\s+/).length : 0} words)
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
                      <h3>
                        Questions {group.range[0]}–{group.range[1]}
                      </h3>
                      <select
                        className="select"
                        style={{ width: 'auto' }}
                        value={group.kind}
                        aria-label="Question type"
                        onChange={(e) =>
                          mutateGroup(group.id, (g, s) => {
                            g.kind = e.target.value as QuestionKind;
                            s.questions.filter((q) => q.groupId === g.id).forEach((q) => (q.type = KIND_TYPE[g.kind]));
                          })
                        }
                      >
                        {Object.entries(KIND_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <span className="spacer" />
                      {group.sourcePage !== undefined && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setPage(group.sourcePage!)}>
                          Show page {group.sourcePage + 1}
                        </button>
                      )}
                    </div>
                    <div className="field">
                      <span className="label">Instructions</span>
                      <CommitInput multiline label="Instructions" value={group.instructions} onCommit={(v) => mutateGroup(group.id, (g) => (g.instructions = v))} />
                    </div>
                    {(group.kind === 'matching' || group.kind === 'mcq_multi' || group.options?.length) && (
                      <div className="field">
                        <span className="label">Options students choose from</span>
                        <CommitInput
                          multiline
                          rows={Math.min(10, (group.options?.length ?? 0) + 1)}
                          label="Options"
                          placeholder={'One per line\nA military innovation\nB large reward'}
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
                        <summary>Notes / summary text shown to students</summary>
                        <CommitInput multiline rows={8} className="serif" label="Notes text" value={group.context} onCommit={(v) => mutateGroup(group.id, (g) => (g.context = v))} />
                      </details>
                    )}
                  </>
                ) : (
                  test.skill !== 'Writing' && test.skill !== 'Speaking' && <h3>Questions</h3>
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
                    <Plus size={15} /> Add question
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmPublish && (
        <Modal
          title="Publish with problems?"
          onClose={() => setConfirmPublish(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmPublish(false)}>
                Go back and fix
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setConfirmPublish(false);
                  save(true);
                }}
              >
                Publish anyway
              </button>
            </>
          }
        >
          {errorsAll.length} {errorsAll.length === 1 ? 'problem was' : 'problems were'} found, for example: <em>{errorsAll[0]?.message}</em>. Students may be marked
          wrong for correct answers.
        </Modal>
      )}
    </div>
  );
};
