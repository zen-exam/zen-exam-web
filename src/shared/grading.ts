// SHARED: identical copy in backend/src/shared/grading.ts. Change both together (types, grading rules, Gemini page schema).
// Pure grading rules shared by the browser (instant feedback, teacher preview) and the
// server (authoritative score for every submitted attempt).
import type { Question, StudentAnswer, TestDefinition } from './exam.ts';

/** Writing and Speaking are reviewed by a person, not auto-graded. */
export const isAutoGraded = (q: Pick<Question, 'type'>) => q.type !== 'essay' && q.type !== 'speaking';

/**
 * Standard IELTS Academic Reading Band Score scale (normalized to total questions)
 */
export function calculateBandScore(rawScore: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  const ratio = rawScore / maxScore;
  const scaledOutOf40 = Math.round(ratio * 40);

  if (scaledOutOf40 >= 39) return 9.0;
  if (scaledOutOf40 >= 37) return 8.5;
  if (scaledOutOf40 >= 35) return 8.0;
  if (scaledOutOf40 >= 33) return 7.5;
  if (scaledOutOf40 >= 30) return 7.0;
  if (scaledOutOf40 >= 27) return 6.5;
  if (scaledOutOf40 >= 23) return 6.0;
  if (scaledOutOf40 >= 19) return 5.5;
  if (scaledOutOf40 >= 15) return 5.0;
  if (scaledOutOf40 >= 13) return 4.5;
  if (scaledOutOf40 >= 10) return 4.0;
  if (scaledOutOf40 >= 8) return 3.5;
  if (scaledOutOf40 >= 5) return 3.0;
  return 2.5;
}

/**
 * Smart answer grading with case insensitivity and accepted variants
 */
export function gradeAnswer(
  userAns: string,
  correctAns: string | string[],
  type: string
): boolean {
  if (!userAns || !userAns.trim()) return false;
  const u = userAns.trim().toLowerCase();

  // "(the) harbour" accepts "harbour" and "the harbour"
  const answers = (Array.isArray(correctAns) ? correctAns : [correctAns]).flatMap((a) =>
    a.includes('(')
      ? [a.replace(/\(([^)]*)\)/g, '$1'), a.replace(/\([^)]*\)/g, '')].map((v) => v.replace(/\s+/g, ' ').trim())
      : [a]
  );

  for (const rawTarget of answers) {
    const t = rawTarget.trim().toLowerCase();
    if (u === t) return true;

    // True/False/Not Given shortcuts
    if (type === 'true_false_not_given' || type === 'yes_no_not_given') {
      if ((u === 't' || u === 'true') && (t === 't' || t === 'true')) return true;
      if ((u === 'f' || u === 'false') && (t === 'f' || t === 'false')) return true;
      if ((u === 'ng' || u === 'not given' || u === 'notgiven') && (t === 'ng' || t === 'not given' || t === 'notgiven'))
        return true;
      if ((u === 'y' || u === 'yes') && (t === 'y' || t === 'yes')) return true;
      if ((u === 'n' || u === 'no') && (t === 'n' || t === 'no')) return true;
    }

    // MCQ option single letter match (e.g. "A" vs "A. Some text")
    if (type === 'multiple_choice') {
      const uFirst = u.charAt(0);
      const tFirst = t.charAt(0);
      if (uFirst === tFirst && ['a', 'b', 'c', 'd'].includes(uFirst)) return true;
    }

    // Normalized words (strip common articles)
    const cleanWord = (s: string) => s.replace(/^(the|a|an)\s+/i, '').replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').trim();
    if (cleanWord(u) === cleanWord(t)) return true;
  }

  return false;
}

/** Teacher override wins over automatic grading. */
export function isAnswerCorrect(q: Question, ans?: StudentAnswer): boolean {
  if (ans?.manualOverrideStatus === 'correct') return true;
  if (ans?.manualOverrideStatus === 'incorrect') return false;
  return gradeAnswer(ans?.answer || '', q.correctAnswer, q.type);
}

/** Score over auto-graded questions only; Writing/Speaking need a human or rubric review. */
export function scoreAttempt(test: TestDefinition, answers: Record<number, StudentAnswer>) {
  const graded = test.sections.flatMap((s) => s.questions).filter(isAutoGraded);
  const rawScore = graded.filter((q) => isAnswerCorrect(q, answers[q.number])).length;
  return { rawScore, maxScore: graded.length, bandScore: calculateBandScore(rawScore, graded.length) };
}
