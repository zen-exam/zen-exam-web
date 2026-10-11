import type { TestDefinition } from '../../shared/exam';
import { locale, t } from '../../i18n';

type Skill = TestDefinition['skill'];

/** Section label as printed on IELTS papers: "Passage 2", "Part 3", "Task 1". */
export const sectionLabel = (skill: Skill, n: number) => t(`section.${skill}`, { n });

export const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? (s ? t('duration.minSec', { m, s }) : t('duration.min', { m })) : t('duration.sec', { s });
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

export const answerList = (a: string | string[]) => (Array.isArray(a) ? a : a ? [a] : []);
