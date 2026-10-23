import { QUESTIONS, TOPICS } from './questions.js';
import { STORAGE_KEY, freshState, sanitizeState, questionPool, progress, nextQuestionId } from './model.js';

const $ = (id) => document.getElementById(id);
const gradeNames = { again: 'не разобрался', partial: 'частично', good: 'уверенно' };
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

let state = freshState();
let storageHealthy = true;
let toastTimer;

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { state = sanitizeState(JSON.parse(saved)); }
    catch { state = freshState(); }
  }
} catch {
  storageHealthy = false;
}

function currentQuestion() {
  return QUESTIONS.find((question) => question.id === state.current);
}

function recordFor(question) {
  return state.records[question.id] ??= { text: '', revealed: false, grade: null };
}

function prepareQuestion() {
  const question = currentQuestion();
  if (question) recordFor(question).revealed = false;
}

function renderSaveStatus() {
  $('save-status').querySelector('span').textContent = storageHealthy
    ? 'Прогресс сохраняется в браузере'
    : 'Сохранение недоступно. Не закрывай вкладку.';
  $('save-status').style.color = storageHealthy ? '' : '#b47a55';
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageHealthy = true;
  } catch {
    storageHealthy = false;
  }
  renderSaveStatus();
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}

function renderTopics() {
  const all = progress(state);
  const button = (id, name, icon, count, total) => `
    <button class="topic-button ${id === 'all' ? 'all-topics ' : ''}${state.topic === id ? 'active' : ''}"
      data-topic="${id}" aria-pressed="${state.topic === id}">
      <span class="topic-icon" aria-hidden="true">${icon}</span><span>${name}</span>
      <span class="topic-count">${count}/${total}</span>
    </button>`;
  $('topic-nav').innerHTML = button('all', 'Все темы', '⊞', all.reviewed, all.total)
    + TOPICS.map((topic) => {
      const part = progress(state, topic.id);
      return button(topic.id, topic.name, topic.icon, part.reviewed, part.total);
    }).join('');
}

function renderProgress() {
  const all = progress(state);
  $('progress-percent').innerHTML = `${all.percent}<span>%</span>`;
  $('progress-ring').style.strokeDashoffset = String(421 * (1 - all.reviewed / all.total));
  $('progress-count').textContent = `${all.reviewed} из ${all.total}`;
  $('good-count').textContent = all.good;
  $('repeat-count').textContent = all.repeat;
  $('topic-progress').innerHTML = TOPICS.map((topic) => {
    const part = progress(state, topic.id);
    return `<div class="topic-progress-row"><span>${topic.name}</span><span>${part.reviewed} / ${part.total}</span>
      <div class="mini-track" role="progressbar" aria-label="${topic.name}"
        aria-valuenow="${part.reviewed}" aria-valuemin="0" aria-valuemax="${part.total}">
        <div style="width:${part.percent}%"></div>
      </div></div>`;
  }).join('');
  renderSaveStatus();
}

function renderDraftInfo() {
  const record = recordFor(currentQuestion());
  $('char-count').textContent = `${[...record.text].length.toLocaleString('ru-RU')} символов`;
  $('draft-indicator').textContent = record.text
    ? (storageHealthy ? 'Черновик сохранён' : 'Черновик только в этой вкладке')
    : 'Сформулируй своими словами';
}

function renderEmptyState() {
  const copy = {
    repeat: ['Пока нечего повторять', 'Оцени ответы как «Частично» или «Не разобрался» — они появятся здесь для следующего подхода.'],
    new: ['Все вопросы в этом фильтре оценены', 'Выбери другую тему или вернись к вопросам, которые стоит повторить.'],
    good: ['Уверенность придёт с практикой', 'Здесь появятся вопросы, которые ты отметишь как «Уверенно». Начни с любого вопроса.'],
    all: ['Вопросов пока нет', 'Выбери другую тему.'],
  }[state.scope];
  $('empty-title').textContent = copy[0];
  $('empty-description').textContent = copy[1];
}

function renderQuestion() {
  const question = currentQuestion();
  const pool = questionPool(state);
  const empty = !question;
  $('question-card').hidden = empty;
  $('question-navigation').hidden = empty;
  $('empty-state').hidden = !empty;
  document.querySelector('.keyboard-hint').hidden = empty;
  if (empty) return renderEmptyState();

  const record = recordFor(question);
  const topic = TOPICS.find((item) => item.id === question.topic);
  const index = pool.findIndex((item) => item.id === question.id);
  $('question-topic').textContent = topic.name;
  $('question-topic').style.color = topic.color;
  $('question-topic').style.background = topic.color + '12';
  $('question-topic').style.borderColor = topic.color + '30';
  $('question-position').textContent = index >= 0
    ? `ВОПРОС ${String(index + 1).padStart(2, '0')} / ${String(pool.length).padStart(2, '0')}`
    : 'ОЦЕНЁН · ВНЕ ФИЛЬТРА';
  $('question-title').textContent = question.title;
  $('question-prompt').textContent = question.prompt;
  $('question-code').hidden = !question.code;
  $('question-code').querySelector('code').textContent = question.code;
  $('answer').value = record.text;
  renderDraftInfo();

  $('reference').hidden = !record.revealed;
  $('reveal-button').querySelector('span').textContent = record.revealed ? 'Скрыть разбор' : 'Раскрыть разбор';
  $('reveal-button').setAttribute('aria-expanded', String(record.revealed));
  $('reference-answer').textContent = question.answer;
  $('reference-keys').innerHTML = question.keys.map((text) => `<li>${escape(text)}</li>`).join('');
  $('reference-mistakes').innerHTML = question.mistakes.map((text) => `<li>${escape(text)}</li>`).join('');
  $('reference-followup').textContent = question.followup;
  $('reference-source').href = question.source;

  document.querySelectorAll('[data-grade]').forEach((button) => {
    const selected = button.dataset.grade === record.grade;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('assessment-message').textContent = record.grade
    ? `Сохранено: ${gradeNames[record.grade]}. Оценку можно изменить.` : '';

  // Keep the just-assessed question visible until the user chooses to move on,
  // even if its new grade removes it from the active filter.
  const singleQuestion = pool.length < 2 && index >= 0;
  $('previous-button').disabled = singleQuestion;
  $('next-button').disabled = singleQuestion;
  $('skip-button').disabled = singleQuestion;
  $('shuffle-button').disabled = pool.length < 2;
}

function render() {
  $('status-filter').value = state.scope;
  renderTopics();
  renderProgress();
  renderQuestion();
}

function scrollTo(element) {
  element.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'nearest',
  });
}

function focusQuestion() {
  const title = currentQuestion() ? $('question-title') : $('empty-title');
  title.focus({ preventScroll: true });
  scrollTo(title);
}

function chooseFilter(topic = state.topic, scope = state.scope) {
  state.topic = topic;
  state.scope = scope;
  const pool = questionPool(state);
  if (!pool.some((question) => question.id === state.current)) state.current = pool[0]?.id ?? null;
  prepareQuestion();
  save();
  render();
}

function move(direction) {
  state.current = nextQuestionId(state, direction);
  prepareQuestion();
  save();
  render();
  focusQuestion();
}

function reveal() {
  const question = currentQuestion();
  if (!question) return;
  const record = recordFor(question);
  record.revealed = !record.revealed;
  save();
  renderQuestion();
  if (record.revealed) {
    $('reference-title').focus({ preventScroll: true });
    scrollTo($('reference-title'));
  }
}

function renderBank() {
  $('bank-list').innerHTML = TOPICS.map((topic) => {
    const part = progress(state, topic.id);
    const items = QUESTIONS.filter((question) => question.topic === topic.id).map((question) => {
      const record = state.records[question.id];
      const status = record?.grade ? gradeNames[record.grade] : record?.text ? 'черновик' : 'без оценки';
      return `<button class="bank-item ${question.id === state.current ? 'current' : ''}" data-question="${question.id}">
        <span>${escape(question.title)}</span><span>${status} ↗</span></button>`;
    }).join('');
    return `<section class="bank-topic"><h3>${topic.name}<span>${part.reviewed} / ${part.total}</span></h3>${items}</section>`;
  }).join('');
}

// Event handlers use delegation for navigation and assessment controls.
$('topic-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-topic]');
  if (button) chooseFilter(button.dataset.topic);
});
$('status-filter').addEventListener('change', (event) => chooseFilter(state.topic, event.target.value));
$('answer').addEventListener('input', (event) => {
  const question = currentQuestion();
  if (!question) return;
  recordFor(question).text = event.target.value;
  save();
  renderDraftInfo();
});
$('reveal-button').addEventListener('click', reveal);
$('previous-button').addEventListener('click', () => move(-1));
$('next-button').addEventListener('click', () => move(1));
$('skip-button').addEventListener('click', () => {
  move(1);
  toast('Вопрос пропущен. Прогресс не изменился.');
});
$('shuffle-button').addEventListener('click', () => {
  const pool = questionPool(state).filter((question) => question.id !== state.current);
  if (!pool.length) return;
  state.current = pool[Math.floor(Math.random() * pool.length)].id;
  prepareQuestion();
  save();
  renderQuestion();
  focusQuestion();
});
document.querySelector('.grade-buttons').addEventListener('click', (event) => {
  const button = event.target.closest('[data-grade]');
  if (!button || !currentQuestion()) return;
  const previousTotal = progress(state).reviewed;
  recordFor(currentQuestion()).grade = button.dataset.grade;
  save();
  render();
  if (progress(state).reviewed === QUESTIONS.length && previousTotal < QUESTIONS.length) {
    toast('Все 36 вопросов оценены. Теперь можно повторить слабые места.');
  }
});
$('show-all-button').addEventListener('click', () => chooseFilter('all', 'all'));
document.querySelectorAll('.about-open').forEach((button) => {
  button.addEventListener('click', () => $('about-dialog').showModal());
});
$('bank-button').addEventListener('click', () => {
  renderBank();
  $('bank-dialog').showModal();
});
$('bank-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-question]');
  if (!button) return;
  const question = QUESTIONS.find((item) => item.id === button.dataset.question);
  state.topic = question.topic;
  state.scope = 'all';
  state.current = question.id;
  prepareQuestion();
  save();
  render();
  $('bank-dialog').close();
  focusQuestion();
});
$('reset-button').addEventListener('click', () => $('reset-dialog').showModal());
$('confirm-reset').addEventListener('click', () => {
  state = freshState();
  save();
  render();
  $('reset-dialog').close();
  toast('Прогресс сброшен. Можно начать заново.');
  focusQuestion();
});
document.querySelectorAll('.close-dialog').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      dialog.close();
    }
  });
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    reveal();
  }
});

render();
