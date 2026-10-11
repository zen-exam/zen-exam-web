import type {
  PassageSection,
  QuestionGroup,
  QuestionKind,
  QuestionType,
  TestDefinition,
} from '../shared/exam';
import type { KeyedText, PageBlock, PageExtraction } from '../shared/pageExtractionSchema';
import { isAutoGraded } from '../shared/grading.ts';
import { t } from '../i18n/index.ts';

// Pure: merges per-page Gemini extractions into one TestDefinition per skill and checks
// the result against IELTS rules. Listening and Reading both number 1-40, so they can't
// share a test without colliding on question numbers.

type Skill = TestDefinition['skill'];

export interface ExtractedPage {
  imageUrl: string;
  extraction: PageExtraction;
}

/** What kind of problem, independent of the (translated) message. */
export type IssueCode = 'duplicate' | 'missing' | 'not_forty' | 'group_count' | 'no_answer' | 'bad_answer' | 'too_long';

export interface AssemblyIssue {
  level: 'error' | 'warning';
  code: IssueCode;
  skill: Skill;
  message: string;
  questionNumber?: number;
}

/** Answers by skill; 'any' holds keys printed without a Listening/Reading heading. */
export type AnswerKey = Map<'Reading' | 'Listening' | 'any', Map<number, string[]>>;

const KIND_TO_TYPE: Record<QuestionKind, QuestionType> = {
  gap_fill: 'fill_in_the_blank',
  short_answer: 'fill_in_the_blank',
  true_false_not_given: 'true_false_not_given',
  yes_no_not_given: 'yes_no_not_given',
  mcq_single: 'multiple_choice',
  mcq_multi: 'multiple_choice',
  matching: 'matching_headings',
};

const TIME_LIMIT: Record<Skill, number> = { Listening: 40, Reading: 60, Writing: 60, Speaking: 15 };


const blockSkill = (b: PageBlock): Skill =>
  b.type === 'writing_task'
    ? 'Writing'
    : b.type === 'speaking_part'
      ? 'Speaking'
      : b.skill === 'listening'
        ? 'Listening'
        : 'Reading';

const formatOptions = (opts?: KeyedText[]) =>
  opts && opts.length ? opts.map((o) => `${o.key}. ${o.text}`) : undefined;

const splitAlternatives = (answer: string) =>
  answer
    .split(/\s+\/\s+|\s+OR\s+/)
    .map((a) => a.trim())
    .filter(Boolean);

/** "27 ______" / "27 [27] ______" -> "[27] ______" so every gap uses the same marker. */
export const normalizeGapMarkers = (text: string) =>
  text.replace(/\b(\d{1,2})\s+(?=\[\1\])/g, '').replace(/(?<![[\d])(\d{1,2})\s*_{3,}/g, '[$1] ______');

/** "A Stadiums are..." -> "[A] Stadiums are..." only when paragraph letters run A, B, C... in order. */
export function normalizeParagraphLetters(content: string): string {
  const paras = content.split('\n\n');
  const letters = paras.map((p) => p.match(/^\[?([A-J])\]?\s+(?=[A-Z])/)?.[1]);
  const lettered = letters.filter(Boolean).join('');
  if (lettered.length < 3 || !'ABCDEFGHIJ'.startsWith(lettered)) return content;
  return paras.map((p, i) => (letters[i] ? p.replace(/^\[?([A-J])\]?\s+/, '[$1] ') : p)).join('\n\n');
}

/** One answer per line ("23 C / D"), optionally under LISTENING / READING headings. */
export function parseAnswerKeyText(text: string): AnswerKey {
  const key: AnswerKey = new Map();
  let bucket: 'Reading' | 'Listening' | 'any' = 'any';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^(listening|reading)\b/i);
    if (heading) {
      bucket = heading[1].toLowerCase() === 'listening' ? 'Listening' : 'Reading';
      continue;
    }
    // A line may hold several columns: "1 TRUE    14 B    27 NOT GIVEN"
    for (const m of line.matchAll(/(?:^|\s{2,}|\t)(\d{1,2})[\s.:)]+(.+?)(?=\s{2,}\d{1,2}[\s.:)]|\t\d{1,2}[\s.:)]|$)/g)) {
      const n = Number(m[1]);
      if (n < 1 || n > 40) continue;
      if (!key.has(bucket)) key.set(bucket, new Map());
      key.get(bucket)!.set(n, splitAlternatives(m[2]));
    }
  }
  return key;
}

export function formatAnswerKeyText(pages: ExtractedPage[]): string {
  const bySkill = new Map<string, string[]>();
  for (const b of pages.flatMap((p) => p.extraction.blocks)) {
    if (b.type !== 'answer_key' || !b.answers?.length) continue;
    const heading = b.skill === 'listening' ? 'LISTENING' : b.skill === 'reading' ? 'READING' : '';
    const lines = bySkill.get(heading) ?? [];
    for (const a of b.answers) lines.push(`${a.number} ${a.accepted.join(' / ')}`);
    bySkill.set(heading, lines);
  }
  return [...bySkill].map(([h, lines]) => (h ? `${h}\n` : '') + lines.join('\n')).join('\n\n');
}

function lookupAnswer(key: AnswerKey, skill: Skill, n: number): string[] {
  if (skill !== 'Reading' && skill !== 'Listening') return [];
  return key.get(skill)?.get(n) ?? key.get('any')?.get(n) ?? [];
}

export function assembleTests(
  pages: ExtractedPage[],
  key: AnswerKey,
  source: { fileName: string; format: 'text_pdf' | 'scanned_pdf' | 'image'; answerKeyImage?: string }
): { tests: TestDefinition[]; issues: AssemblyIssue[] } {
  const sections = new Map<Skill, Map<number, PassageSection>>();
  const last = new Map<Skill, PassageSection>();
  let testNumber = 0;
  let speakingCounter = 0;

  const section = (skill: Skill, n: number) => {
    if (!sections.has(skill)) sections.set(skill, new Map());
    const bySkill = sections.get(skill)!;
    if (!bySkill.has(n)) {
      const label = { Reading: 'Reading Passage', Listening: 'Listening Part', Writing: 'Writing Task', Speaking: 'Speaking Part' }[skill];
      bySkill.set(n, { id: `sec_${skill.toLowerCase()}_${n}`, sectionNumber: n, title: `${label} ${n}`, instructions: '', content: '', questions: [], groups: [] });
    }
    const sec = bySkill.get(n)!;
    last.set(skill, sec);
    return sec;
  };

  for (const [pageIndex, page] of pages.entries()) {
    for (const b of page.extraction.blocks) {
      if (b.testNumber && !testNumber) testNumber = b.testNumber;
      const skill = blockSkill(b);
      const prev = last.get(skill);

      if (b.type === 'passage') {
        // A continuation belongs to the previous passage even if the model guessed another number;
        // unnumbered text also continues it unless that passage already got its questions.
        const n =
          prev && b.continuesPrevious
            ? prev.sectionNumber
            : b.sectionNumber || (prev && !prev.questions.length ? prev.sectionNumber : (prev?.sectionNumber ?? 0) + 1);
        const sec = section(skill, n);
        if (b.title && /^Reading Passage \d+$/.test(sec.title)) sec.title = b.title;
        if (b.text) {
          // a page break mid-sentence is not a paragraph break
          const glue = !sec.content || /[.!?"'”)]$/.test(sec.content) ? '\n\n' : ' ';
          sec.content = sec.content ? sec.content + glue + b.text.trim() : b.text.trim();
        }
      } else if (b.type === 'question_group' && b.questions?.length) {
        const start = b.rangeStart || Math.min(...b.questions.map((q) => q.number));
        const n =
          b.sectionNumber ||
          (skill === 'Listening' ? Math.min(4, Math.max(1, Math.ceil(start / 10))) : (prev?.sectionNumber ?? 1));
        const sec = section(skill, n);
        const kind = b.questionKind ?? 'gap_fill';
        const group: QuestionGroup = {
          id: `g_${skill.toLowerCase()}_${start}`,
          range: [start, b.rangeEnd || Math.max(...b.questions.map((q) => q.number))],
          kind,
          instructions: (b.instructions ?? '').trim(),
          context: b.text ? normalizeGapMarkers(b.text.trim()) : undefined,
          options: b.options?.length ? b.options : undefined,
          maxWords: b.maxWords || undefined,
          allowNumber: b.allowNumber || undefined,
          sourcePage: pageIndex,
        };
        sec.groups!.push(group);
        if (b.hasFigure) sec.figureImage = page.imageUrl;
        for (const q of b.questions) {
          sec.questions.push({
            id: `q_${q.number}`,
            number: q.number,
            type: KIND_TO_TYPE[kind],
            // the model is told to leave the number out; strip it if it slipped in
            prompt: q.prompt.replace(new RegExp(`\\[?\\b${q.number}\\]?\\s*(?=_{3,})`), '').trim(),
            options: formatOptions(kind === 'mcq_single' ? q.options : b.options),
            correctAnswer: lookupAnswer(key, skill, q.number),
            points: 1,
            groupId: group.id,
          });
        }
      } else if (b.type === 'writing_task' && b.text) {
        const n = b.sectionNumber || (prev?.sectionNumber ?? 0) + 1;
        const sec = section(skill, n);
        sec.content = b.text.trim();
        if (b.hasFigure) sec.figureImage = page.imageUrl;
        sec.questions = [{ id: `q_${n}`, number: n, type: 'essay', prompt: `Writing Task ${n}`, correctAnswer: [], points: 0 }];
      } else if (b.type === 'speaking_part' && b.text) {
        const sec = section(skill, b.sectionNumber || (prev?.sectionNumber ?? 0) + 1);
        sec.content = [sec.content, b.text.trim()].filter(Boolean).join('\n\n');
        for (const line of b.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const n = ++speakingCounter;
          sec.questions.push({ id: `q_${n}`, number: n, type: 'speaking', prompt: line, correctAnswer: [], points: 0 });
        }
      }
    }
  }

  const now = new Date().toISOString();
  const tests: TestDefinition[] = [];
  const issues: AssemblyIssue[] = [];
  for (const skill of ['Listening', 'Reading', 'Writing', 'Speaking'] as Skill[]) {
    const bySkill = sections.get(skill);
    if (!bySkill?.size) continue;
    const secs = [...bySkill.values()].sort((a, b) => a.sectionNumber - b.sectionNumber);
    for (const s of secs) {
      if (skill === 'Reading') s.content = normalizeParagraphLetters(s.content);
      s.questions.sort((a, b) => a.number - b.number);
      s.instructions = s.groups?.map((g) => g.instructions).filter(Boolean).join('\n\n') ?? '';
    }
    const test: TestDefinition = {
      id: `test_${Date.now().toString(36)}_${skill.toLowerCase()}`,
      title: `${testNumber ? `Test ${testNumber} · ` : ''}IELTS ${skill}`,
      module: 'Academic',
      skill,
      timeLimitMinutes: TIME_LIMIT[skill],
      totalQuestions: secs.reduce((sum, s) => sum + s.questions.length, 0),
      sections: secs,
      sourceDocument: {
        format: source.format,
        fileName: source.fileName,
        pageImages: pages.map((p) => p.imageUrl),
        answerKeyImage: source.answerKeyImage,
      },
      createdAt: now,
      updatedAt: now,
      status: 'draft',
    };
    tests.push(test);
    issues.push(...validateTest(test));
  }
  return { tests, issues };
}

/** Rule checks that catch extraction mistakes before a teacher publishes. */
export function validateTest(test: TestDefinition): AssemblyIssue[] {
  const issues: AssemblyIssue[] = [];
  const add = (level: AssemblyIssue['level'], code: IssueCode, message: string, questionNumber?: number) =>
    issues.push({ level, code, skill: test.skill, message, questionNumber });
  if (test.skill === 'Writing' || test.skill === 'Speaking') return issues;

  const questions = test.sections.flatMap((s) => s.questions);
  const groups = new Map(test.sections.flatMap((s) => s.groups ?? []).map((g) => [g.id, g]));
  const seen = new Set<number>();
  for (const q of questions) {
    if (seen.has(q.number)) add('error', 'duplicate', t('issue.duplicate', { n: q.number }), q.number);
    seen.add(q.number);
  }
  const max = Math.max(0, ...seen);
  for (let n = 1; n <= max; n++) if (!seen.has(n)) add('error', 'missing', t('issue.missing', { n }), n);
  if (max !== 40) add('warning', 'not_forty', t('issue.notForty', { n: seen.size, skill: t(`skill.${test.skill}`) }));

  for (const g of groups.values()) {
    const count = questions.filter((q) => q.groupId === g.id).length;
    const expected = g.range[1] - g.range[0] + 1;
    if (count !== expected) add('error', 'group_count', t('issue.groupCount', { from: g.range[0], to: g.range[1], expected, count }), g.range[0]);
  }

  for (const q of questions) {
    const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer].filter(Boolean);
    if (!answers.length) {
      add('warning', 'no_answer', t('issue.noAnswer', { n: q.number }), q.number);
      continue;
    }
    const g = q.groupId ? groups.get(q.groupId) : undefined;
    const upper = answers.map((a) => a.toUpperCase());
    if (q.type === 'true_false_not_given' && upper.some((a) => !['TRUE', 'FALSE', 'NOT GIVEN'].includes(a)))
      add('error', 'bad_answer', t('issue.notTfng', { n: q.number, answer: answers.join(' / ') }), q.number);
    if (q.type === 'yes_no_not_given' && upper.some((a) => !['YES', 'NO', 'NOT GIVEN'].includes(a)))
      add('error', 'bad_answer', t('issue.notYnng', { n: q.number, answer: answers.join(' / ') }), q.number);
    if ((q.type === 'multiple_choice' || q.type === 'matching_headings') && q.options?.length) {
      const keys = q.options.map((o) => o.split('.')[0].trim().toUpperCase());
      for (const a of upper) if (!keys.includes(a)) add('error', 'bad_answer', t('issue.notOption', { n: q.number, answer: a, keys: keys.join(', ') }), q.number);
    }
    if (q.type === 'fill_in_the_blank' && g?.maxWords) {
      for (const a of answers) {
        const words = a.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter((w) => w && !(g.allowNumber && /^[\d.,:/£$%-]+$/.test(w)));
        if (words.length > g.maxWords) add('warning', 'too_long', t('issue.tooLong', { n: q.number, answer: a, max: g.maxWords }), q.number);
      }
    }
  }
  return issues;
}

/** Reading questions without a key answer, grouped by section, for the text-only solve call. */
export function unansweredBySection(test: TestDefinition) {
  return test.sections
    .map((s) => ({ section: s, questions: s.questions.filter((q) => isAutoGraded(q) && !(Array.isArray(q.correctAnswer) ? q.correctAnswer.length : q.correctAnswer)) }))
    .filter((x) => x.questions.length);
}
