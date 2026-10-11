import React, { useEffect } from 'react';
import { Headphones, BookOpen, PenLine, Mic, Languages } from 'lucide-react';
import type { TestDefinition } from '../../shared/exam';
import { LANGS, getLang, setLang, t } from '../../i18n';

type Skill = TestDefinition['skill'];

const SKILL_ICON = { Listening: Headphones, Reading: BookOpen, Writing: PenLine, Speaking: Mic };

export const SkillBadge: React.FC<{ skill: Skill }> = ({ skill }) => {
  const Icon = SKILL_ICON[skill] ?? BookOpen;
  return (
    <span className={`badge badge-${skill.toLowerCase()}`}>
      <Icon size={12} aria-hidden />
      {t(`skill.${skill}`)}
    </span>
  );
};

export const Modal: React.FC<{
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, footer, wide, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, children, action }) => (
  <div className="empty">
    {icon}
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);

/** EN | VI toggle: both choices visible, one click to switch. Names are shown in their own language. */
export const LangSwitch: React.FC = () => (
  <div className="lang-switch" role="group" aria-label={t('common.language')}>
    <Languages size={14} aria-hidden />
    {LANGS.map((l) => (
      <button key={l.value} lang={l.value} aria-pressed={getLang() === l.value} title={l.label} aria-label={l.label} onClick={() => setLang(l.value)}>
        {l.short}
      </button>
    ))}
  </div>
);
