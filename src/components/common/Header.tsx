import React from 'react';
import { BookOpen, LogOut } from 'lucide-react';
import type { User } from '../../shared/exam';

export type NavItem = { id: 'practice' | 'tests' | 'accounts'; label: string };

const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', admin: 'Admin' };

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
        <nav className="main-nav" aria-label="Main">
          {nav.map((item) => (
            <button key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
      )}
      <div className="user-menu">
        <div className="user-id">
          <span className="user-name">{user.name}</span>
          <span className={`badge role-${user.role}`}>{ROLE_LABEL[user.role]}</span>
        </div>
        <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={17} />
        </button>
      </div>
    </div>
  </header>
);
