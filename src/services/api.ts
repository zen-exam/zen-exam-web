import type { ExamAttempt, Role, StudentAnswer, TestDefinition, User } from '../shared/exam';

export interface StorageUsage {
  month: string;
  resetsAt: string;
  classA: number;
  classB: number;
  storageBytes: number;
  limits: { classA: number; classB: number; storageBytes: number };
  source: 'cloudflare' | 'estimate';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Backend URL when it's deployed on its own domain; empty = same origin (dev proxy or host rewrites). */
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Exam images are stored by the backend as /files/... paths. */
export const assetUrl = <T extends string | undefined>(path: T): T =>
  (path?.startsWith('/files/') ? `${API_BASE}${path}` : path) as T;

/** Fired when the server says the session is gone, so the app can show the sign-in screen. */
export const SIGNED_OUT_EVENT = 'zen:signed-out';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: API_BASE ? 'include' : 'same-origin', // cross-origin needs 'include' to send the session cookie
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export const api = {
  // Auth
  me: () => request<{ user: User }>('GET', '/api/auth/me').then((r) => r.user),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/api/auth/login', { email, password }).then((r) => r.user),
  logout: () => request('POST', '/api/auth/logout'),

  // Accounts (admin)
  listUsers: () => request<{ users: User[] }>('GET', '/api/users').then((r) => r.users),
  createUser: (u: { name: string; email: string; role: Role; password: string }) =>
    request<{ user: User }>('POST', '/api/users', u).then((r) => r.user),
  updateUser: (id: string, patch: Partial<{ name: string; role: Role; disabled: boolean; password: string }>) =>
    request<{ user: User }>('PATCH', `/api/users/${id}`, patch).then((r) => r.user),

  // Tests (students get published tests without answers)
  listTests: () => request<{ tests: TestDefinition[] }>('GET', '/api/tests').then((r) => r.tests),
  saveTest: (t: TestDefinition) => request<{ test: TestDefinition }>('PUT', `/api/tests/${t.id}`, t).then((r) => r.test),
  deleteTest: (id: string) => request('DELETE', `/api/tests/${id}`),
  testAttempts: (id: string) => request<{ attempts: ExamAttempt[] }>('GET', `/api/tests/${id}/attempts`).then((r) => r.attempts),

  // Attempts: the server scores submissions; the client only sends answer text
  myAttempts: () => request<{ attempts: ExamAttempt[] }>('GET', '/api/attempts').then((r) => r.attempts),
  submitAttempt: (testId: string, answers: Record<number, StudentAnswer>, durationSeconds: number) =>
    request<{ attempt: ExamAttempt }>('POST', '/api/attempts', { testId, answers, durationSeconds }).then((r) => r.attempt),
  getAttempt: (id: string) => request<{ attempt: ExamAttempt; test: TestDefinition }>('GET', `/api/attempts/${id}`),
  overrideAnswer: (attemptId: string, questionNumber: number, status: StudentAnswer['manualOverrideStatus']) =>
    request<{ attempt: ExamAttempt }>('PATCH', `/api/attempts/${attemptId}/overrides`, { questionNumber, status }).then((r) => r.attempt),

  // R2 free-tier usage this month (teachers/admins)
  storageUsage: () => request<{ usage: StorageUsage }>('GET', '/api/storage/usage').then((r) => r.usage),

  // Gemini (teachers/admins)
  extractPage: <T,>(imageDataUrl: string) => request<{ data: T; model: string }>('POST', '/api/gemini/extract-page', { imageDataUrl }),
  solve: <T,>(passage: string, questions: unknown[]) => request<{ data: T; model: string }>('POST', '/api/gemini/solve', { passage, questions }),
};
