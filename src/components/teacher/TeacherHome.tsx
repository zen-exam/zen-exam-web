import React, { useEffect, useState } from 'react';
import { Plus, FileStack, Eye, Pencil, Trash2, Users, AlertTriangle, HardDrive } from 'lucide-react';
import { api, type StorageUsage } from '../../services/api';
import type { TestDefinition } from '../../shared/exam';
import { validateTest } from '../../services/examAssembler';
import { EmptyState, Modal, SkillBadge } from '../common/ui';
import { formatDate } from '../common/format';
import { locale, t, tNode } from '../../i18n';

export const TeacherHome: React.FC<{
  tests: TestDefinition[];
  onAdd: () => void;
  onEdit: (testId: string) => void;
  onPreview: (testId: string) => void;
  onAttempts: (testId: string) => void;
  onDelete: (test: TestDefinition) => Promise<void>;
}> = ({ tests, onAdd, onEdit, onPreview, onAttempts, onDelete }) => {
  const [toDelete, setToDelete] = useState<TestDefinition | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => {
    api.storageUsage().then(setUsage, () => {});
  }, [tests]);
  const [deleting, setDeleting] = useState(false);
  const drafts = tests.filter((x) => x.status !== 'published');
  const published = tests.filter((x) => x.status === 'published');

  const row = (test: TestDefinition) => {
    const count = test.attemptCount ?? 0;
    const problems = test.status === 'published' ? 0 : validateTest(test).filter((i) => i.level === 'error').length;
    return (
      <div key={test.id} className="list-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row-wrap">
            <SkillBadge skill={test.skill} />
            <span className="title">{test.title}</span>
          </div>
          <div className="sub">
            <span>{t('common.questions', { n: test.totalQuestions })}</span>
            <span>{t('common.minutes', { n: test.timeLimitMinutes })}</span>
            <span>{t('common.added', { date: formatDate(test.createdAt) })}</span>
            {problems > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={12} style={{ verticalAlign: -1 }} aria-hidden /> {t('teacher.toFix', { n: problems })}
              </span>
            )}
          </div>
        </div>
        <div className="actions">
          {test.status === 'published' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => onAttempts(test.id)}>
                <Users size={15} /> {count ? t('teacher.resultsCount', { n: count }) : t('teacher.results')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onPreview(test.id)}>
                <Eye size={15} /> {t('teacher.preview')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(test.id)}>
                <Pencil size={15} /> {t('teacher.edit')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(test.id)}>
              {t('teacher.continueReview')}
            </button>
          )}
          <button className="icon-btn" onClick={() => setToDelete(test)} aria-label={t('teacher.deleteTest', { title: test.title })} title={t('common.delete')}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('teacher.title')}</h1>
          <p className="subtitle">{t('teacher.subtitle')}</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onAdd}>
            <Plus size={16} /> {t('teacher.addTest')}
          </button>
        </div>
      </div>

      {usage && <UsageNotice usage={usage} />}

      {tests.length === 0 ? (
        <EmptyState
          icon={<FileStack size={36} />}
          title={t('home.emptyTitle')}
          action={
            <button className="btn btn-primary" onClick={onAdd}>
              <Plus size={16} /> {t('teacher.addFirst')}
            </button>
          }
        >
          {t('teacher.emptyBody')}
        </EmptyState>
      ) : (
        <>
          {drafts.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 0 }}>
                <h2>{t('teacher.needsReview')}</h2>
                <span className="muted small">{t('teacher.notVisible')}</span>
              </div>
              <div className="list">{drafts.map(row)}</div>
            </>
          )}
          <div className="section-title" style={drafts.length ? undefined : { marginTop: 0 }}>
            <h2>{t('teacher.published')}</h2>
            <span className="muted small">{t('teacher.studentsCanTake')}</span>
          </div>
          {published.length ? (
            <div className="list">{published.map(row)}</div>
          ) : (
            <p className="muted">{t('teacher.nothingPublished')}</p>
          )}
        </>
      )}

      {toDelete && (
        <Modal
          title={t('teacher.deleteTitle')}
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDelete(toDelete);
                  setDeleting(false);
                  setToDelete(null);
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          {tNode('teacher.deleteBody', { title: <strong>{toDelete.title}</strong> })}
        </Modal>
      )}
    </div>
  );
};

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtCount = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));

/** Image storage against R2's free tier: a quiet line normally, a warning from 80% of any cap. */
const UsageNotice: React.FC<{ usage: StorageUsage }> = ({ usage: u }) => {
  const reset = new Date(u.resetsAt).toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ratio = Math.max(u.storageBytes / u.limits.storageBytes, u.classA / u.limits.classA, u.classB / u.limits.classB);
  const uploadsPaused = u.classA >= u.limits.classA || u.storageBytes >= u.limits.storageBytes;
  const imagesPaused = u.classB >= u.limits.classB;
  const detail = t('usage.detail', {
    used: fmtBytes(u.storageBytes),
    usedLimit: fmtBytes(u.limits.storageBytes),
    a: fmtCount(u.classA),
    aLimit: fmtCount(u.limits.classA),
    b: fmtCount(u.classB),
    bLimit: fmtCount(u.limits.classB),
  });
  if (ratio < 0.8)
    return (
      <p className="small muted row" style={{ marginBottom: 16 }} title={t(u.source === 'estimate' ? 'usage.estimated' : 'usage.fromCloudflare')}>
        <HardDrive size={14} aria-hidden /> {detail}
      </p>
    );
  return (
    <div className={`alert ${uploadsPaused || imagesPaused ? 'alert-danger' : 'alert-warning'}`} style={{ marginBottom: 16 }}>
      <AlertTriangle size={16} />
      <div>
        <strong>
          {uploadsPaused
            ? t('usage.uploadsPaused', { date: reset })
            : imagesPaused
              ? t('usage.imagesPaused', { date: reset })
              : t('usage.close')}
        </strong>
        <div className="small">{t('usage.resets', { detail, date: reset })}</div>
      </div>
    </div>
  );
};
