import React, { useEffect, useState } from 'react';
import { Plus, FileStack, Eye, Pencil, Trash2, Users, AlertTriangle, HardDrive } from 'lucide-react';
import { api, type StorageUsage } from '../../services/api';
import type { TestDefinition } from '../../shared/exam';
import { validateTest } from '../../services/examAssembler';
import { EmptyState, Modal, SkillBadge } from '../common/ui';
import { formatDate } from '../common/format';

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
  const drafts = tests.filter((t) => t.status !== 'published');
  const published = tests.filter((t) => t.status === 'published');

  const row = (t: TestDefinition) => {
    const count = t.attemptCount ?? 0;
    const problems = t.status === 'published' ? 0 : validateTest(t).filter((i) => i.level === 'error').length;
    return (
      <div key={t.id} className="list-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row-wrap">
            <SkillBadge skill={t.skill} />
            <span className="title">{t.title}</span>
          </div>
          <div className="sub">
            <span>{t.totalQuestions} questions</span>
            <span>{t.timeLimitMinutes} min</span>
            <span>Added {formatDate(t.createdAt)}</span>
            {problems > 0 && (
              <span style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={12} style={{ verticalAlign: -1 }} aria-hidden /> {problems} to fix
              </span>
            )}
          </div>
        </div>
        <div className="actions">
          {t.status === 'published' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => onAttempts(t.id)}>
                <Users size={15} /> Results{count ? ` (${count})` : ''}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onPreview(t.id)}>
                <Eye size={15} /> Preview
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t.id)}>
                <Pencil size={15} /> Edit
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(t.id)}>
              Continue review
            </button>
          )}
          <button className="icon-btn" onClick={() => setToDelete(t)} aria-label={`Delete ${t.title}`} title="Delete">
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
          <h1>Your tests</h1>
          <p className="subtitle">Upload an exam paper, check what was read, and publish it for students.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={onAdd}>
            <Plus size={16} /> Add a test
          </button>
        </div>
      </div>

      {usage && <UsageNotice usage={usage} />}

      {tests.length === 0 ? (
        <EmptyState
          icon={<FileStack size={36} />}
          title="No tests yet"
          action={
            <button className="btn btn-primary" onClick={onAdd}>
              <Plus size={16} /> Add your first test
            </button>
          }
        >
          Upload a PDF or photos of an IELTS paper and we'll turn it into an online test.
        </EmptyState>
      ) : (
        <>
          {drafts.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 0 }}>
                <h2>Needs review</h2>
                <span className="muted small">Not visible to students yet</span>
              </div>
              <div className="list">{drafts.map(row)}</div>
            </>
          )}
          <div className="section-title" style={drafts.length ? undefined : { marginTop: 0 }}>
            <h2>Published</h2>
            <span className="muted small">Students can take these</span>
          </div>
          {published.length ? (
            <div className="list">{published.map(row)}</div>
          ) : (
            <p className="muted">Nothing published yet. Review a draft above and publish it.</p>
          )}
        </>
      )}

      {toDelete && (
        <Modal
          title="Delete this test?"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>
                Cancel
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
                Delete
              </button>
            </>
          }
        >
          <strong>{toDelete.title}</strong> and all student results for it will be removed. This can't be undone.
        </Modal>
      )}
    </div>
  );
};

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const fmtCount = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));

/** Image storage against R2's free tier: a quiet line normally, a warning from 80% of any cap. */
const UsageNotice: React.FC<{ usage: StorageUsage }> = ({ usage: u }) => {
  const reset = new Date(u.resetsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ratio = Math.max(u.storageBytes / u.limits.storageBytes, u.classA / u.limits.classA, u.classB / u.limits.classB);
  const uploadsPaused = u.classA >= u.limits.classA || u.storageBytes >= u.limits.storageBytes;
  const imagesPaused = u.classB >= u.limits.classB;
  const detail = `Storage ${fmtBytes(u.storageBytes)} of ${fmtBytes(u.limits.storageBytes)} · uploads ${fmtCount(u.classA)} of ${fmtCount(u.limits.classA)} · image views ${fmtCount(u.classB)} of ${fmtCount(u.limits.classB)} this month`;
  if (ratio < 0.8)
    return (
      <p className="small muted row" style={{ marginBottom: 16 }} title={u.source === 'estimate' ? 'Estimated: Cloudflare analytics unavailable' : 'From Cloudflare'}>
        <HardDrive size={14} aria-hidden /> {detail}
      </p>
    );
  return (
    <div className={`alert ${uploadsPaused || imagesPaused ? 'alert-danger' : 'alert-warning'}`} style={{ marginBottom: 16 }}>
      <AlertTriangle size={16} />
      <div>
        <strong>
          {uploadsPaused
            ? `New image uploads are paused until ${reset} to stay within the free plan.`
            : imagesPaused
              ? `Exam page images are hidden until ${reset} to stay within the free plan.`
              : 'Image storage is close to the free plan limits.'}
        </strong>
        <div className="small">{detail}. Limits reset on {reset}.</div>
      </div>
    </div>
  );
};
