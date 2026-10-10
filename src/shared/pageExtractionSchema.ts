// SHARED: identical copy in backend/src/shared/pageExtractionSchema.ts. Change both together (types, grading rules, Gemini page schema).
// Shared by the Vite dev-server endpoint (vite.config.ts) and the client assembler.
// One Gemini vision call per page image returns the blocks printed on that page;
// examAssembler.ts merges pages into tests in code.

import type { QuestionKind } from './exam.ts';

export type BlockSkill = 'reading' | 'listening' | 'writing' | 'speaking' | 'unknown';
export interface KeyedText {
  key: string;
  text: string;
}

export interface PageBlock {
  type: 'passage' | 'question_group' | 'answer_key' | 'writing_task' | 'speaking_part' | 'other';
  skill: BlockSkill;
  testNumber?: number;
  sectionNumber?: number;
  title?: string;
  text?: string;
  hasFigure?: boolean;
  continuesPrevious?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  questionKind?: QuestionKind;
  instructions?: string;
  maxWords?: number;
  allowNumber?: boolean;
  options?: KeyedText[];
  questions?: Array<{ number: number; prompt: string; options?: KeyedText[] }>;
  answers?: Array<{ number: number; accepted: string[] }>;
}

export interface PageExtraction {
  blocks: PageBlock[];
}

const keyedText = {
  type: 'object',
  properties: { key: { type: 'string' }, text: { type: 'string' } },
  required: ['key', 'text'],
};

// Gemini responseSchema (OpenAPI subset)
export const PAGE_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['passage', 'question_group', 'answer_key', 'writing_task', 'speaking_part', 'other'],
          },
          skill: { type: 'string', enum: ['reading', 'listening', 'writing', 'speaking', 'unknown'] },
          testNumber: { type: 'integer' },
          sectionNumber: { type: 'integer' },
          title: { type: 'string', description: 'Heading only, under 15 words. Never body text.' },
          text: {
            type: 'string',
            description: 'Body text written once: passage paragraphs, task prompt, speaking questions, or the notes/summary the gaps sit in.',
          },
          hasFigure: { type: 'boolean' },
          continuesPrevious: { type: 'boolean' },
          rangeStart: { type: 'integer' },
          rangeEnd: { type: 'integer' },
          questionKind: {
            type: 'string',
            enum: [
              'gap_fill',
              'short_answer',
              'true_false_not_given',
              'yes_no_not_given',
              'mcq_single',
              'mcq_multi',
              'matching',
            ],
          },
          instructions: { type: 'string', description: 'Instruction lines of a question group, verbatim, written once.' },
          maxWords: { type: 'integer' },
          allowNumber: { type: 'boolean' },
          options: { type: 'array', items: keyedText },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'integer' },
                prompt: { type: 'string' },
                options: { type: 'array', items: keyedText },
              },
              required: ['number', 'prompt'],
            },
          },
          answers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'integer' },
                accepted: { type: 'array', items: { type: 'string' } },
              },
              required: ['number', 'accepted'],
            },
          },
        },
        required: ['type', 'skill'],
        // Short metadata first, long free text last: Gemini emits keys in this order
        propertyOrdering: [
          'type',
          'skill',
          'testNumber',
          'sectionNumber',
          'title',
          'rangeStart',
          'rangeEnd',
          'questionKind',
          'maxWords',
          'allowNumber',
          'hasFigure',
          'continuesPrevious',
          'instructions',
          'options',
          'text',
          'questions',
          'answers',
        ],
      },
    },
  },
  required: ['blocks'],
};

export const PAGE_PROMPT = `This image is one page of an IELTS exam paper (Listening, Reading, Writing or Speaking) or of its answer key.
Transcribe it into blocks, in reading order. Transcribe text exactly; do not summarise, answer, or invent anything.

Block types:
- "passage": Reading passage text. sectionNumber = the passage number ("READING PASSAGE 2" -> 2). title = the passage title.
  text = the paragraphs separated by a blank line; keep paragraph letters as "[A] ", "[B] " when printed. Join words hyphenated across lines.
  continuesPrevious = true when the page starts mid-passage with no heading.
- "question_group": one "Questions X-Y" group. rangeStart/rangeEnd = X/Y. instructions = the instruction lines verbatim.
  skill = "listening" if the page says Listening/PART/SECTION with audio cues, else "reading". sectionNumber = the passage/part number if stated or inferable from the page heading, else 0.
  questionKind, decided from the INSTRUCTIONS:
    gap_fill (complete notes/summary/sentences/table/flow-chart/form/diagram with words from the text),
    short_answer (answer the questions with words), true_false_not_given, yes_no_not_given,
    mcq_single (choose A, B, C or D), mcq_multi (choose TWO/THREE letters),
    matching (match headings/paragraphs/features/people/sentence endings, OR complete a summary using a lettered list of words/phrases from a box).
  maxWords / allowNumber from limits like "NO MORE THAN TWO WORDS AND/OR A NUMBER" (2 / true), "ONE WORD ONLY" (1 / false); 0 / false if none.
  options = the shared box (list of headings "i".."x", phrases "A".."J", people, paragraph letters) as {key, text}; for mcq_multi the shared A-E list.
  text = the notes/summary/table/form the gaps sit in, with every gap written as "[n] ______" (n = question number), keeping headings and line breaks. "" if none.
  questions: one entry per question number in the range.
    prompt never contains the question number. For gap_fill write the sentence or line holding that gap with the gap as "______"
    (prefix the notes sub-heading when the line alone is unclear). For statements/stems copy them exactly. For matching, the item to match.
    For mcq_single put that question's own A-D options in options. For mcq_multi repeat the stem for each number.
- "answer_key": an answer key page. testNumber = the "Test n" it belongs to (0 if unstated). skill = listening/reading.
  answers: every question number with accepted answers as printed. Split alternatives ("A / B", "colour OR color") into separate strings.
  Keep optional words in brackets as printed, e.g. "(the) lighthouse". For "23&24 IN EITHER ORDER C, D" output 23: ["C","D"] and 24: ["C","D"].
- "writing_task": sectionNumber = task number, text = the full task prompt, hasFigure = true if a chart/graph/map/diagram is shown.
- "speaking_part": sectionNumber = part number, text = the questions or cue card, one per line.
- "other": cover pages, page furniture. Skip headers, footers, page numbers, QR codes, watermarks, phone numbers and non-English text entirely.
Set testNumber whenever "Test n" is printed on the page.`;
