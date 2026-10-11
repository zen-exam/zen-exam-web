import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { en } from './en.ts';
import { vi } from './vi.ts';

// ponytail: tiny in-house i18n (two languages, flat keys); swap for i18next if plurals/ICU formatting grow

export type Lang = 'en' | 'vi';
export type MessageKey = keyof typeof en;
export const LANGS: { value: Lang; short: string; label: string }[] = [
  { value: 'en', short: 'EN', label: 'English' },
  { value: 'vi', short: 'VI', label: 'Tiếng Việt' },
];

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, vi };
const STORAGE_KEY = 'zen:lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // storage blocked (private mode) or not a browser
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;

export function setLang(next: Lang) {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // not saved; still switches for this visit
  }
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

/** Re-renders the caller when the language changes. Used once in App; children re-render with it. */
export const useLang = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLang
  );

type Vars = Record<string, string | number>;

/** t('home.questions', { n: 40 }) -> "40 questions"; falls back to English for a missing key. */
export function t(key: MessageKey, vars?: Vars): string {
  const text = DICTS[lang][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Like t(), but variables may be elements: tNode('x', { title: <strong>…</strong> }). */
export function tNode(key: MessageKey, vars: Record<string, ReactNode>): ReactNode {
  const parts = (DICTS[lang][key] ?? en[key]).split(/\{(\w+)\}/g); // odd indexes are variable names
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? (vars[p] ?? `{${p}}`) : p)));
}

/** BCP 47 tag for dates and numbers. */
export const locale = () => (lang === 'vi' ? 'vi-VN' : 'en-GB');
