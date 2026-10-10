// SHARED: identical copy in backend/src/shared/exam.ts. Change both together (types, grading rules, Gemini page schema).
export type QuestionType =
  | 'true_false_not_given'
  | 'yes_no_not_given'
  | 'multiple_choice'
  | 'fill_in_the_blank'
  | 'matching_headings'
  | 'essay' // Writing task: free text, not auto-graded
  | 'speaking'; // Speaking prompt: no typed answer, not auto-graded

/** Finer IELTS format of a question group, as printed in its instructions. */
export type QuestionKind =
  | 'gap_fill'
  | 'short_answer'
  | 'true_false_not_given'
  | 'yes_no_not_given'
  | 'mcq_single'
  | 'mcq_multi'
  | 'matching';

/** Shared context of a "Questions X-Y" group, kept for display and answer checking. */
export interface QuestionGroup {
  id: string;
  range: [number, number];
  kind: QuestionKind;
  instructions: string;
  context?: string; // notes/summary/table/form text with "[n] ______" gaps
  options?: { key: string; text: string }[]; // shared box: headings, phrases A-J, people...
  maxWords?: number; // "NO MORE THAN TWO WORDS" -> 2
  allowNumber?: boolean; // "... AND/OR A NUMBER"
  sourcePage?: number; // index into sourceDocument.pageImages, for side-by-side review
}

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  prompt: string;
  options?: string[]; // for multiple_choice or matching_headings
  correctAnswer: string | string[]; // Single answer or acceptable alternates (e.g., ['A', 'True', 'wooden beam'])
  explanation?: string;
  passageAnchor?: string; // Paragraph reference e.g., "Paragraph B"
  points: number;
  groupId?: string; // -> PassageSection.groups
  needsReview?: boolean; // answer was inferred by the model, not taken from an answer key
}

export interface PassageSection {
  id: string;
  sectionNumber: number; // 1, 2, 3 (Reading Passage 1, 2, 3)
  title: string;
  instructions: string; // e.g., "You should spend about 20 minutes on Questions 1-13..."
  content: string; // Passage text with paragraph markings e.g. [A], [B], [C]
  questions: Question[];
  groups?: QuestionGroup[];
  figureImage?: string; // page image for Writing Task 1 charts / Listening maps
}

export interface TestDefinition {
  id: string;
  title: string;
  module: 'Academic' | 'General Training';
  skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  timeLimitMinutes: number; // Default 60 mins
  totalQuestions: number;
  sections: PassageSection[];
  sourceDocument?: {
    format: 'text_pdf' | 'scanned_pdf' | 'image';
    fileName: string;
    fileSizeFormatted?: string;
    pageImages: string[]; // Base64 or URL previews of the source pages
    answerKeyImage?: string; // Base64 or URL of the official answer key page/image
  };
  publicJsonUrl?: string; // Direct link to saved JSON file in public/data/exams/
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'published';
  attemptCount?: number; // teacher/admin listings only
}

export interface StudentAnswer {
  questionId: string;
  questionNumber: number;
  answer: string;
  flagged?: boolean;
  manualOverrideStatus?: 'correct' | 'incorrect' | null;
  teacherFeedback?: string;
}

export interface ExamAttempt {
  id: string;
  testId: string;
  testTitle: string;
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  answers: Record<number, StudentAnswer>; // Keyed by questionNumber
  rawScore: number;
  maxScore: number;
  bandScore: number;
  submitted: boolean;
  userId?: string;
  studentName?: string; // teacher/admin listings only
  studentEmail?: string;
}

export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}
