import assert from 'node:assert/strict';
import test from 'node:test';
import { QUESTIONS, TOPICS } from '../assets/js/questions.js';
import { freshState, sanitizeState, questionPool, progress, nextQuestionId } from '../assets/js/model.js';

test('36 unique questions, 6 per topic, with complete reference material', () => {
  assert.equal(QUESTIONS.length, 36);
  assert.equal(new Set(QUESTIONS.map((question) => question.id)).size, 36);
  for (const topic of TOPICS) {
    assert.equal(QUESTIONS.filter((question) => question.topic === topic.id).length, 6);
  }
  for (const question of QUESTIONS) {
    for (const field of ['title', 'prompt', 'answer', 'followup']) assert.ok(question[field].length > 5);
    assert.ok(question.keys.length >= 3 && question.mistakes.length >= 2);
    assert.match(question.source, /^https:\/\/(learn\.microsoft\.com|devblogs\.microsoft\.com|www\.postgresql\.org)\//);
  }
});

test('topic and status filters compose correctly', () => {
  const state = freshState();
  state.topic = 'pg';
  state.records['pg-1'] = { grade: 'partial' };
  state.records['pg-2'] = { grade: 'good' };
  assert.equal(questionPool(state).length, 6);
  state.scope = 'repeat';
  assert.deepEqual(questionPool(state).map((question) => question.id), ['pg-1']);
  state.scope = 'good';
  assert.deepEqual(questionPool(state).map((question) => question.id), ['pg-2']);
  state.scope = 'new';
  assert.equal(questionPool(state).length, 4);
  state.topic = 'all';
  assert.equal(questionPool(state).length, 34);
});

test('revealing or drafting is not a completed question; reassessment is not double counted', () => {
  const state = freshState();
  state.records['clr-1'] = { text: 'My answer', revealed: true };
  assert.equal(progress(state).reviewed, 0);
  state.records['clr-1'].grade = 'partial';
  assert.equal(progress(state).reviewed, 1);
  assert.equal(progress(state).repeat, 1);
  state.records['clr-1'].grade = 'good';
  assert.equal(progress(state).reviewed, 1);
  assert.equal(progress(state).good, 1);
  assert.equal(progress(state).repeat, 0);
});

test('answers, reveal status and current question survive a save round trip', () => {
  const state = freshState();
  state.current = 'cs-3';
  state.records['cs-3'] = { text: '<script> & русский ответ', revealed: true, grade: 'partial' };
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
});

test('unknown and malformed saved values are ignored', () => {
  assert.deepEqual(sanitizeState({ version: 99 }), freshState());
  assert.deepEqual(sanitizeState(null), freshState());
  const clean = sanitizeState({ version: 1, topic: 'bad', scope: 'bad', records: { 'clr-1': { text: {}, grade: 'wrong' } } });
  assert.equal(clean.topic, 'all');
  assert.equal(clean.scope, 'all');
  assert.equal(clean.records['clr-1'].text, '');
  assert.equal(progress(clean).reviewed, 0);
});

test('navigation wraps and respects the active topic', () => {
  const state = freshState();
  state.topic = 'pg';
  state.current = 'pg-6';
  assert.equal(nextQuestionId(state, 1), 'pg-1');
  state.current = 'pg-1';
  assert.equal(nextQuestionId(state, -1), 'pg-6');
});

test('an assessed item can leave the repeat filter without breaking navigation', () => {
  const state = freshState();
  state.scope = 'repeat';
  state.records['clr-1'] = { grade: 'partial' };
  state.records['pg-1'] = { grade: 'again' };
  state.records['clr-1'].grade = 'good';
  assert.equal(nextQuestionId(state, 1), 'pg-1');
  state.records['pg-1'].grade = 'good';
  assert.equal(nextQuestionId(state, 1), null);
});

test('completion reaches 100% and leaves no new or repeat questions', () => {
  const state = freshState();
  for (const question of QUESTIONS) state.records[question.id] = { grade: 'good' };
  assert.equal(progress(state).percent, 100);
  state.scope = 'new';
  assert.equal(questionPool(state).length, 0);
  state.scope = 'repeat';
  assert.equal(questionPool(state).length, 0);
});
