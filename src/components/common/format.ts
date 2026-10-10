import type { TestDefinition } from '../../shared/exam';

type Skill = TestDefinition['skill'];

/** Section label as printed on IELTS papers: "Passage 2", "Part 3", "Task 1". */
export const sectionLabel = (skill: Skill, n: number) =>
  `${{ Reading: 'Passage', Listening: 'Part', Writing: 'Task', Speaking: 'Part' }[skill]} ${n}`;

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min ${s ? `${s} s` : ''}`.trim() : `${s} s`;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const answerList = (a: string | string[]) => (Array.isArray(a) ? a : a ? [a] : []);
