import { QUESTIONS, TOPICS } from './questions.js';

export const STORAGE_KEY = 'interview-lab-dotnet-v1';
export const GRADES = ['again', 'partial', 'good'];
export const SCOPES = ['all', 'new', 'repeat', 'good'];

export function freshState() {
  return { version: 1, topic: 'all', scope: 'all', current: QUESTIONS[0].id, records: {} };
}

export function questionPool(state) {
  return QUESTIONS.filter((question) => {
    if (state.topic !== 'all' && question.topic !== state.topic) return false;
    const grade = state.records[question.id]?.grade;
    return state.scope === 'all'
      || (state.scope === 'new' && !grade)
      || (state.scope === 'repeat' && (grade === 'again' || grade === 'partial'))
      || (state.scope === 'good' && grade === 'good');
  });
}

export function sanitizeState(raw) {
  const clean = freshState();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return clean;
  if (raw.topic === 'all' || TOPICS.some((topic) => topic.id === raw.topic)) clean.topic = raw.topic;
  if (SCOPES.includes(raw.scope)) clean.scope = raw.scope;

  for (const question of QUESTIONS) {
    const record = raw.records?.[question.id];
    if (!record || typeof record !== 'object') continue;
    clean.records[question.id] = {
      text: typeof record.text === 'string' ? record.text.slice(0, 20000) : '',
      revealed: record.revealed === true,
      grade: GRADES.includes(record.grade) ? record.grade : null,
    };
  }

  const pool = questionPool(clean);
  clean.current = pool.some((question) => question.id === raw.current)
    ? raw.current
    : pool[0]?.id ?? null;
  return clean;
}

export function progress(state, topic = 'all') {
  const questions = QUESTIONS.filter((question) => topic === 'all' || question.topic === topic);
  const grades = questions.map((question) => state.records[question.id]?.grade);
  const reviewed = grades.filter((grade) => GRADES.includes(grade)).length;
  return {
    total: questions.length,
    reviewed,
    good: grades.filter((grade) => grade === 'good').length,
    repeat: grades.filter((grade) => grade === 'again' || grade === 'partial').length,
    percent: questions.length ? Math.round(reviewed / questions.length * 100) : 0,
  };
}

export function nextQuestionId(state, direction) {
  const pool = questionPool(state);
  if (!pool.length) return null;
  const index = pool.findIndex((question) => question.id === state.current);
  if (index < 0) return pool[direction > 0 ? 0 : pool.length - 1].id;
  return pool[(index + direction + pool.length) % pool.length].id;
}
