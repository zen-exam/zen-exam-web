import React, { useState } from 'react';
import { ArrowLeft, Upload, FileText, Image as ImageIcon, X, CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from 'lucide-react';
import type { TestDefinition } from '../../shared/exam';
import { extractPdfContent } from '../../services/pdfExtractService';
import { digitizeWithGemini, fileToDataUrl } from '../../services/geminiExamService';
import { api } from '../../services/api';
import { TestEditor } from './TestEditor';

type Step = 'upload' | 'reading' | 'review';
type LogItem = { level: 'info' | 'success' | 'warning' | 'error'; message: string };

const LOG_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

/** PDFs become one image per page; images pass through. */
async function toPageImages(files: File[]) {
  const images: string[] = [];
  let format: 'text_pdf' | 'scanned_pdf' | 'image' = 'image';
  for (const f of files) {
    if (f.type === 'application/pdf') {
      const pdf = await extractPdfContent(f);
      format = pdf.isScannedHeuristic ? 'scanned_pdf' : 'text_pdf';
      images.push(...pdf.pages.map((p) => p.imageDataUrl));
    } else {
      images.push(await fileToDataUrl(f));
    }
  }
  return { images, format };
}

const DropZone: React.FC<{
  id: string;
  title: string;
  hint: string;
  files: File[];
  onChange: (files: File[]) => void;
}> = ({ id, title, hint, files, onChange }) => {
  const [dragging, setDragging] = useState(false);
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type === 'application/pdf' || f.type.startsWith('image/'));
    if (picked.length) onChange([...files, ...picked]);
  };
  return (
    <div>
      <label
        htmlFor={id}
        className="dropzone"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <Upload size={26} aria-hidden />
        <strong>{title}</strong>
        <span className="muted small">{hint}</span>
      </label>
      <input
        id={id}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = ''; // allow picking the same file again after removing it
        }}
      />
      {files.length > 0 && (
        <div className="file-list">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="file-item">
              {f.type === 'application/pdf' ? <FileText size={16} aria-hidden /> : <ImageIcon size={16} aria-hidden />}
              <span className="name">{f.name}</span>
              <span className="muted small">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button className="icon-btn" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AddTest: React.FC<{ onSaved: (message: string) => void; onCancel: () => void }> = ({ onSaved, onCancel }) => {
  const [step, setStep] = useState<Step>('upload');
  const [examFiles, setExamFiles] = useState<File[]>([]);
  const [keyFiles, setKeyFiles] = useState<File[]>([]);
  const [keyText, setKeyText] = useState('');
  const [progress, setProgress] = useState({ pct: 0, status: '' });
  const [log, setLog] = useState<LogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<TestDefinition[]>([]);

  const read = async () => {
    setStep('reading');
    setError(null);
    setLog([]);
    setProgress({ pct: 2, status: 'Preparing pages…' });
    try {
      const exam = await toPageImages(examFiles);
      const key = await toPageImages(keyFiles);
      const result = await digitizeWithGemini({
        pageImages: exam.images,
        answerKeyImages: key.images,
        answerKeyText: keyText,
        fileName: examFiles.map((f) => f.name).join(', '),
        format: exam.format,
        onLog: (level, message) => setLog((l) => [...l, { level, message }]),
        onProgress: (pct, status) => setProgress({ pct, status }),
      });
      if (!result.tests.length) throw new Error("We couldn't find any IELTS questions or tasks in these files.");

      // Save as drafts right away, so nothing is lost if the review is left half-way
      setProgress({ pct: 97, status: 'Saving draft…' });
      const saved: TestDefinition[] = [];
      for (const t of result.tests) saved.push(await api.saveTest(t));
      setDrafts(saved);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const stepState = (s: Step) => {
    const order: Step[] = ['upload', 'reading', 'review'];
    return order.indexOf(s) < order.indexOf(step) ? 'done' : s === step ? 'current' : 'todo';
  };

  const stepper = (
    <div className="steps" aria-label="Progress">
      {(
        [
          ['upload', 'Upload'],
          ['reading', 'Read exam'],
          ['review', 'Review & publish'],
        ] as const
      ).map(([s, label], i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="step-sep" />}
          <span className="step" data-state={stepState(s)}>
            <span className="step-num">{stepState(s) === 'done' ? '✓' : i + 1}</span>
            {label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );

  if (step === 'review') {
    return <TestEditor tests={drafts} onSaved={onSaved} onBack={onCancel} header={stepper} />;
  }

  return (
    <div className="page page-narrow">
      <button className="back-link" onClick={onCancel}>
        <ArrowLeft size={16} /> Your tests
      </button>
      <div className="page-header">
        <div>
          <h1>Add a test</h1>
          <p className="subtitle">Upload an IELTS paper. We read every page and build the online test for you to check.</p>
        </div>
      </div>
      {stepper}

      {step === 'upload' && (
        <div className="stack">
          <div className="card card-body stack">
            <div>
              <h3>1. Exam paper</h3>
              <p className="muted small">A PDF, or photos of each page. Listening, Reading, Writing and Speaking are all supported.</p>
            </div>
            <DropZone
              id="exam-files"
              title="Drop files here or click to choose"
              hint="PDF, JPG or PNG · several files are fine"
              files={examFiles}
              onChange={setExamFiles}
            />
          </div>

          <div className="card card-body stack">
            <div>
              <h3>
                2. Answer key <span className="badge">Optional</span>
              </h3>
              <p className="muted small">
                Add it for exact answers. Without one, Reading answers are worked out from the passage and marked for you to check.
              </p>
            </div>
            <DropZone id="key-files" title="Drop the answer key page" hint="PDF, JPG or PNG" files={keyFiles} onChange={setKeyFiles} />
            <details className="disclosure">
              <summary>Or type the answers</summary>
              <textarea
                className="textarea"
                rows={6}
                value={keyText}
                onChange={(e) => setKeyText(e.target.value)}
                placeholder={'One per line, e.g.\n1 population\n2 suburbs\n23 C / D'}
              />
            </details>
          </div>

          <div className="row">
            <span className="spacer" />
            <button className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary btn-lg" disabled={!examFiles.length} onClick={read}>
              Read exam
            </button>
          </div>
        </div>
      )}

      {step === 'reading' && (
        <div className="card card-body stack">
          {error ? (
            <>
              <div className="alert alert-danger">
                <XCircle size={16} />
                <div>
                  <strong>Something went wrong.</strong> {error}
                </div>
              </div>
              <div className="row">
                <button className="btn btn-secondary" onClick={() => setStep('upload')}>
                  Change files
                </button>
                <button className="btn btn-primary" onClick={read}>
                  Try again
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <Loader2 size={18} className="spin" aria-hidden />
                <strong>{progress.status}</strong>
                <span className="spacer" />
                <span className="muted small">{progress.pct}%</span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="muted small">This takes about 5–10 seconds per page. You can keep this tab open in the background.</p>
            </>
          )}
          {log.length > 0 && (
            <div className="activity" aria-live="polite">
              {log.map((item, i) => {
                const Icon = LOG_ICON[item.level];
                return (
                  <div key={i} className="activity-item" data-level={item.level}>
                    <Icon size={14} aria-hidden />
                    <span>{item.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
