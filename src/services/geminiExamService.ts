import type { TestDefinition } from '../shared/exam';
import type { PageExtraction } from '../shared/pageExtractionSchema';
import {
  assembleTests,
  formatAnswerKeyText,
  parseAnswerKeyText,
  unansweredBySection,
  validateTest,
  type AssemblyIssue,
  type ExtractedPage,
} from './examAssembler';
import { api } from './api';

const MAX_SIDE = 2000; // px; plenty for reading a scan and for Gemini, and keeps photos well under the 5 MB upload limit

/** Loads a photo/scan and re-encodes it as JPEG no larger than MAX_SIDE, so phone photos don't hit storage limits. */
export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export const extractPage = (imageDataUrl: string) => api.extractPage<PageExtraction>(imageDataUrl);

/** Human-readable transcript of the extraction, shown in the review pane. */
export function formatTranscript(pages: ExtractedPage[]): string {
  return pages
    .map((p, i) => {
      const body = p.extraction.blocks
        .filter((b) => b.type !== 'other')
        .map((b) => {
          const head = `[${b.type}${b.sectionNumber ? ` ${b.sectionNumber}` : ''}${b.rangeStart ? ` Q${b.rangeStart}-${b.rangeEnd}` : ''}${b.questionKind ? ` ${b.questionKind}` : ''}]`;
          const lines = [head, b.title, b.instructions, b.options?.map((o) => `${o.key}. ${o.text}`).join('\n'), b.text];
          for (const q of b.questions ?? []) lines.push(`${q.number}. ${q.prompt}${q.options?.length ? '\n   ' + q.options.map((o) => `${o.key}. ${o.text}`).join('\n   ') : ''}`);
          for (const a of b.answers ?? []) lines.push(`${a.number} ${a.accepted.join(' / ')}`);
          return lines.filter(Boolean).join('\n');
        })
        .join('\n\n');
      return `--- Page ${i + 1} ---\n${body}`;
    })
    .join('\n\n');
}

export interface DigitizeResult {
  tests: TestDefinition[];
  issues: AssemblyIssue[];
  answerKeyText: string;
  transcript: string;
}

export async function digitizeWithGemini(opts: {
  pageImages: string[];
  answerKeyImages: string[];
  answerKeyText?: string; // teacher-typed key wins over extracted key pages
  fileName: string;
  format: 'text_pdf' | 'scanned_pdf' | 'image';
  onLog: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  onProgress: (pct: number, status: string) => void;
}): Promise<DigitizeResult> {
  const { onLog, onProgress } = opts;
  const all = [...opts.pageImages.map((img) => ({ img, isKey: false })), ...opts.answerKeyImages.map((img) => ({ img, isKey: true }))];
  const pages: ExtractedPage[] = [];
  const keyPages: ExtractedPage[] = [];

  // ponytail: sequential to stay inside free-tier requests/minute; the server retries 429/503
  for (const [i, { img, isKey }] of all.entries()) {
    const label = isKey ? `Answer key ${i - opts.pageImages.length + 1}` : `Page ${i + 1} of ${opts.pageImages.length}`;
    onProgress(5 + Math.round((i / all.length) * 80), `Reading ${label.toLowerCase()}…`);
    try {
      const { data } = await extractPage(img);
      (isKey ? keyPages : pages).push({ imageUrl: img, extraction: data });
      const found = data.blocks.flatMap((b) =>
        b.type === 'question_group' && b.rangeStart
          ? [`questions ${b.rangeStart}–${b.rangeEnd}`]
          : b.type === 'passage'
            ? ['passage text']
            : b.type === 'answer_key'
              ? [`${b.answers?.length ?? 0} answers`]
              : b.type === 'writing_task' || b.type === 'speaking_part'
                ? [b.type === 'writing_task' ? 'a writing task' : 'speaking questions']
                : []
      );
      onLog('success', `${label}: ${found.length ? [...new Set(found)].join(', ') : 'nothing to use (cover or blank page)'}`);
    } catch (err) {
      onLog('error', `${label}: couldn't be read (${err instanceof Error ? err.message : err})`);
    }
  }

  // Key pages may also be inside the exam PDF (Cambridge books print keys at the back)
  const answerKeyText = opts.answerKeyText?.trim() || formatAnswerKeyText([...keyPages, ...pages]);
  const key = parseAnswerKeyText(answerKeyText);
  const keyCount = [...key.values()].reduce((n, m) => n + m.size, 0);
  if (keyCount) onLog('info', `Answer key: ${keyCount} answers found`);

  onProgress(88, 'Putting the test together…');
  const { tests } = assembleTests(pages, key, {
    fileName: opts.fileName,
    format: opts.format,
    answerKeyImage: opts.answerKeyImages[0],
  });

  // No key entry: Reading answers can be inferred from the passage; Listening needs the audio
  for (const test of tests.filter((t) => t.skill === 'Reading')) {
    for (const { section, questions } of unansweredBySection(test)) {
      onProgress(92, `Working out ${questions.length} missing answers for ${section.title}…`);
      try {
        const groups = new Map(section.groups?.map((g) => [g.id, g]));
        const { data } = await api.solve<{ answers: { number: number; answer: string; evidence: string }[] }>(
          section.content,
          questions.map((q) => {
            const g = q.groupId ? groups.get(q.groupId) : undefined;
            return { number: q.number, instructions: g?.instructions, prompt: q.prompt, options: q.options };
          })
        );
        for (const a of data.answers) {
          const q = questions.find((x) => x.number === a.number);
          if (!q || !a.answer) continue;
          q.correctAnswer = [a.answer];
          q.explanation = a.evidence;
          q.needsReview = true;
        }
        onLog('warning', `${section.title}: ${data.answers.length} answers worked out from the passage (no key). Please check them.`);
      } catch (err) {
        onLog('error', `${section.title}: couldn't work out the missing answers (${err instanceof Error ? err.message : err})`);
      }
    }
  }

  const issues = tests.flatMap(validateTest);
  return { tests, issues, answerKeyText, transcript: formatTranscript([...pages, ...keyPages]) };
}
