import React from 'react';
import { BookOpen, LogOut } from 'lucide-react';
import type { User } from '../../shared/exam';
import { t } from '../../i18n';
import { LangSwitch } from './ui';

export type NavItem = { id: 'practice' | 'tests' | 'accounts' };

export const Header: React.FC<{
  user: User;
  nav: NavItem[];
  active: string;
  onNavigate: (id: NavItem['id']) => void;
  onSignOut: () => void;
}> = ({ user, nav, active, onNavigate, onSignOut }) => (
  <header className="topbar">
    <div className="topbar-inner">
      <div className="brand">
        <span className="brand-mark">
          <BookOpen size={18} aria-hidden />
        </span>
        <span className="brand-name">ZenExam IELTS</span>
      </div>
      {nav.length > 1 && (
        <nav className="main-nav" aria-label={t('nav.main')}>
          {nav.map((item) => (
            <button key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
              {t(`nav.${item.id}`)}
            </button>
          ))}
        </nav>
      )}
      <div className="user-menu">
        <LangSwitch />
        <span className="topbar-sep" aria-hidden />
        <div className="user-id">
          <span className="user-name">{user.name}</span>
          <span className={`badge role-${user.role}`}>{t(`role.${user.role}`)}</span>
        </div>
        <button className="icon-btn" onClick={onSignOut} aria-label={t('app.signOut')} title={t('app.signOut')}>
          <LogOut size={17} />
        </button>
      </div>
    </div>
  </header>
);
