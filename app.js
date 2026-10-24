// =====================================================
// 習慣アプリ（第1弾：ホーム画面）
// データはブラウザの中（localStorage）に保存する
// =====================================================

const STORAGE_KEY = 'habit-app-v1';

// 習慣に選べる色（参考にした画面の色に近づけている）
const COLORS = ['#8cc8ff', '#ffc46b', '#ff8fa3', '#6fd6c3', '#ab9cf5', '#e0a07f'];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// ----- データの形 -----
// {
//   habits: [{ id, name, emoji, color, doneDates: ['2026-10-22', ...] }],
//   goals: { month: { '2026-10': '...' }, year: { '2026': '...' } }
// }
// 目標は「月ごと」「年ごと」に分けて残すので、あとでふりかえりに使える
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.habits)) return saved;
  } catch (e) {
    console.warn('保存データを読み込めませんでした', e);
  }
  return { habits: [], goals: { month: {}, year: {} } };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ----- 日付のヘルパー -----
// 'YYYY-MM-DD' の形にする（日本時間のまま扱うため、toISOString は使わない）
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ----- 連続日数 -----
// 今日まだチェックしていなくても、昨日まで続いていれば連続は切れていない扱いにする
function getStreak(habit) {
  const done = new Set(habit.doneDates);
  let start = done.has(toKey(daysAgo(0))) ? 0 : 1;
  let streak = 0;
  while (done.has(toKey(daysAgo(start + streak)))) streak++;
  return streak;
}

// ユーザーが入力した文字を、HTMLとして読まれないように変換する（安全のため）
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// =====================================================
// 画面を描く
// =====================================================
const $ = (id) => document.getElementById(id);

function render() {
  const now = new Date();
  const todayKey = toKey(now);

  $('today-label').textContent =
    `${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[now.getDay()]}）`;

  renderGoals(now);

  // 習慣の一覧
  const list = $('habit-list');
  list.innerHTML = state.habits.map((habit) => {
    const isDone = habit.doneDates.includes(todayKey);
    const streak = getStreak(habit);

    // 直近7日（左が6日前、右が今日）
    const dots = [6, 5, 4, 3, 2, 1, 0].map((n) => {
      const done = habit.doneDates.includes(toKey(daysAgo(n)));
      return `<span class="week-dot" ${done ? `style="background:${habit.color}"` : ''}></span>`;
    }).join('');

    return `
      <li class="habit-row">
        <button class="habit-emoji" data-edit="${habit.id}" style="background:${habit.color}26" aria-label="${escapeHtml(habit.name)}を編集">
          ${escapeHtml(habit.emoji || '⭐')}
        </button>
        <div class="flex-1 min-w-0" data-edit="${habit.id}">
          <p class="font-semibold truncate">${escapeHtml(habit.name)}</p>
          <p class="text-xs text-zinc-400 mt-0.5">${streak > 0 ? `🔥 ${streak}日連続` : 'まだ連続なし'}</p>
          <div class="week-dots">${dots}</div>
        </div>
        <button class="check-button" data-toggle="${habit.id}"
          style="${isDone ? `background:${habit.color};border-color:${habit.color}` : ''}"
          aria-label="${escapeHtml(habit.name)}を${isDone ? '未完了にする' : '完了にする'}">
          ${isDone ? '✓' : ''}
        </button>
      </li>`;
  }).join('');

  // 今日いくつできたか
  const doneCount = state.habits.filter((h) => h.doneDates.includes(todayKey)).length;
  $('progress-label').textContent =
    state.habits.length ? `${doneCount} / ${state.habits.length} できた` : '';

  $('empty-message').classList.toggle('hidden', state.habits.length > 0);
}

function renderGoals(now) {
  const monthKey = toKey(now).slice(0, 7); // '2026-10'
  const yearKey = String(now.getFullYear()); // '2026'

  $('goal-month-title').textContent = `${now.getMonth() + 1}月の目標`;
  $('goal-year-title').textContent = `${now.getFullYear()}年の目標`;

  setGoalText($('goal-month-text'), state.goals.month[monthKey]);
  setGoalText($('goal-year-text'), state.goals.year[yearKey]);
}

function setGoalText(el, text) {
  el.textContent = text || 'タップして目標を書く';
  el.classList.toggle('is-empty', !text);
}

// =====================================================
// チェックのオン・オフ
// =====================================================
function toggleToday(habitId) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const todayKey = toKey(new Date());
  if (habit.doneDates.includes(todayKey)) {
    habit.doneDates = habit.doneDates.filter((d) => d !== todayKey);
  } else {
    habit.doneDates.push(todayKey);
    if (navigator.vibrate) navigator.vibrate(10); // 対応している端末なら少しブルッとさせる
  }
  saveState();
  render();
}

// 一覧のクリックはまとめて受け取る（行が増えても1か所で済む）
$('habit-list').addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) return toggleToday(toggle.dataset.toggle);

  const edit = e.target.closest('[data-edit]');
  if (edit) openHabitDialog(edit.dataset.edit);
});

// =====================================================
// 習慣の追加・編集
// =====================================================
let editingId = null;
let selectedColor = COLORS[0];

function renderColorChoices() {
  $('color-choices').innerHTML = COLORS.map((color) => `
    <button type="button" class="color-choice" role="radio" data-color="${color}"
      aria-checked="${color === selectedColor}" style="background:${color}"></button>
  `).join('');
}

$('color-choices').addEventListener('click', (e) => {
  const choice = e.target.closest('[data-color]');
  if (!choice) return;
  selectedColor = choice.dataset.color;
  renderColorChoices();
});

function openHabitDialog(habitId = null) {
  const habit = state.habits.find((h) => h.id === habitId);
  editingId = habit ? habit.id : null;

  $('habit-dialog-title').textContent = habit ? '習慣を編集' : '習慣を追加';
  $('habit-name').value = habit ? habit.name : '';
  $('habit-emoji').value = habit ? habit.emoji : '';
  // 新しい習慣は、まだ使っていない色を自動で選ぶ
  selectedColor = habit ? habit.color : COLORS[state.habits.length % COLORS.length];
  $('habit-delete').classList.toggle('hidden', !habit);

  renderColorChoices();
  $('habit-dialog').showModal();
}

$('add-habit-button').addEventListener('click', () => openHabitDialog());
$('habit-cancel').addEventListener('click', () => $('habit-dialog').close());

$('habit-form').addEventListener('submit', () => {
  const name = $('habit-name').value.trim();
  if (!name) return;
  const emoji = $('habit-emoji').value.trim();

  if (editingId) {
    const habit = state.habits.find((h) => h.id === editingId);
    Object.assign(habit, { name, emoji, color: selectedColor });
  } else {
    state.habits.push({
      id: crypto.randomUUID(),
      name,
      emoji,
      color: selectedColor,
      doneDates: [],
    });
  }
  saveState();
  render();
});

$('habit-delete').addEventListener('click', () => {
  const habit = state.habits.find((h) => h.id === editingId);
  if (!habit) return;
  if (!confirm(`「${habit.name}」を削除しますか？\nこれまでの記録も消えます。`)) return;
  state.habits = state.habits.filter((h) => h.id !== editingId);
  saveState();
  render();
  $('habit-dialog').close();
});

// =====================================================
// 目標の入力
// =====================================================
let editingGoalKind = null;

function goalKey(kind) {
  const now = new Date();
  return kind === 'month' ? toKey(now).slice(0, 7) : String(now.getFullYear());
}

document.querySelectorAll('.goal-card').forEach((card) => {
  card.addEventListener('click', () => {
    editingGoalKind = card.dataset.kind;
    const now = new Date();
    $('goal-dialog-title').textContent = editingGoalKind === 'month'
      ? `${now.getMonth() + 1}月の目標`
      : `${now.getFullYear()}年の目標`;
    $('goal-input').value = state.goals[editingGoalKind][goalKey(editingGoalKind)] || '';
    $('goal-dialog').showModal();
  });
});

$('goal-cancel').addEventListener('click', () => $('goal-dialog').close());

$('goal-form').addEventListener('submit', () => {
  state.goals[editingGoalKind][goalKey(editingGoalKind)] = $('goal-input').value.trim();
  saveState();
  render();
});

// アプリを開いたまま日付が変わったときや、別のアプリから戻ってきたときに描き直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

render();
