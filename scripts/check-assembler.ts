// Run: node --experimental-strip-types scripts/check-assembler.ts
import assert from 'node:assert/strict';
import { assembleTests, parseAnswerKeyText, normalizeParagraphLetters, normalizeGapMarkers } from '../src/services/examAssembler.ts';
import type { PageBlock } from '../src/shared/pageExtractionSchema.ts';

const page = (...blocks: PageBlock[]) => ({ imageUrl: 'img', extraction: { blocks } });

// Answer key text: headings, one-per-line, multi-column rows, alternatives
const key = parseAnswerKeyText('LISTENING\n1 train / coach\n2 (the) harbour\n\nREADING\n1 TRUE    2 B\n3 C / D');
assert.deepEqual(key.get('Listening')!.get(1), ['train', 'coach']);
assert.deepEqual(key.get('Listening')!.get(2), ['(the) harbour']);
assert.deepEqual(key.get('Reading')!.get(1), ['TRUE']);
assert.deepEqual(key.get('Reading')!.get(2), ['B']);
assert.deepEqual(key.get('Reading')!.get(3), ['C', 'D']);

const { tests, issues } = assembleTests(
  [
    page({ type: 'passage', skill: 'reading', sectionNumber: 1, title: 'Tunnels', text: 'Romans built the first\nroads and' }),
    // model guessed the wrong section number on a continuation page
    page({ type: 'passage', skill: 'reading', sectionNumber: 2, continuesPrevious: true, text: 'tunnels. It worked.' }),
    page(
      { type: 'question_group', skill: 'reading', rangeStart: 1, rangeEnd: 1, questionKind: 'true_false_not_given', questions: [{ number: 1, prompt: 'Romans built roads.' }] },
      { type: 'question_group', skill: 'reading', rangeStart: 2, rangeEnd: 3, questionKind: 'matching',
        options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }],
        questions: [{ number: 2, prompt: 'item' }, { number: 3, prompt: 'the [3] ______ item' }] },
      { type: 'question_group', skill: 'reading', rangeStart: 4, rangeEnd: 5, questionKind: 'gap_fill', maxWords: 1,
        text: 'Notes: 4 ______ and [5] ______', questions: [{ number: 4, prompt: 'the ______ was long' }] },
    ),
    page({ type: 'question_group', skill: 'listening', rangeStart: 1, rangeEnd: 2, questionKind: 'gap_fill', maxWords: 1,
      questions: [{ number: 1, prompt: 'Travel by ______' }, { number: 2, prompt: 'Meet at ______' }] }),
    page({ type: 'question_group', skill: 'listening', rangeStart: 11, rangeEnd: 11, questionKind: 'mcq_single',
      questions: [{ number: 11, prompt: 'Why?', options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] }] }),
    page({ type: 'writing_task', skill: 'writing', sectionNumber: 1, text: 'The chart shows...', hasFigure: true }),
    page({ type: 'speaking_part', skill: 'speaking', sectionNumber: 1, text: 'Where do you live?\nDo you like it?' }),
  ],
  key,
  { fileName: 'f', format: 'image' }
);

assert.deepEqual(tests.map((t) => t.skill), ['Listening', 'Reading', 'Writing', 'Speaking']);
const [listening, reading, writing, speaking] = tests;

assert.equal(reading.sections.length, 1);
assert.equal(reading.sections[0].content, 'Romans built the first\nroads and tunnels. It worked.');
const rq = reading.sections[0].questions;
assert.equal(rq[1].type, 'matching_headings');
assert.deepEqual(rq[1].options, ['A. x', 'B. y']);
assert.equal(rq[2].prompt, 'the ______ item'); // stray number stripped
assert.equal(reading.sections[0].groups![2].context, 'Notes: [4] ______ and [5] ______');

// Listening parts inferred from ranges, answers from the Listening key
assert.deepEqual(listening.sections.map((s) => s.sectionNumber), [1, 2]);
assert.deepEqual(listening.sections[0].questions[0].correctAnswer, ['train', 'coach']);

assert.equal(writing.sections[0].questions[0].type, 'essay');
assert.equal(writing.sections[0].figureImage, 'img');
assert.deepEqual(speaking.sections[0].questions.map((q) => q.prompt), ['Where do you live?', 'Do you like it?']);

// Rule checks: answer C/D not in matching options A-B, group 4-5 has one question, Q5 missing
const readingErrors = issues.filter((i) => i.skill === 'Reading' && i.level === 'error').map((i) => i.message);
assert.ok(readingErrors.some((m) => m.includes('answer "C" is not one of the options')), readingErrors.join('\n'));
assert.ok(readingErrors.some((m) => m.includes('Questions 4-5: expected 2 questions, found 1')));
assert.ok(issues.some((i) => i.skill === 'Listening' && i.message === 'Question 11 has no answer'));
assert.ok(issues.some((i) => i.skill === 'Listening' && i.message === 'Question 3 is missing'));

assert.equal(normalizeParagraphLetters('A Big\n\nB Second\n\nC Third'), '[A] Big\n\n[B] Second\n\n[C] Third');
assert.equal(normalizeParagraphLetters('A Royal Commission met.\n\nIt failed.'), 'A Royal Commission met.\n\nIt failed.');

assert.equal(normalizeGapMarkers('a 27 [27] ______ b 28 ______ c [29] ______'), 'a [27] ______ b [28] ______ c [29] ______');

console.log('check-assembler: ok');
