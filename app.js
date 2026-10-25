// =====================================================
// 習慣アプリ（第1弾：ホーム画面・ふりかえり画面）
// データはブラウザの中（localStorage）に保存する
// =====================================================

const STORAGE_KEY = 'habit-app-v1';

// 習慣に選べる色（参考にした画面の色に近づけている）
const COLORS = ['#8cc8ff', '#ffc46b', '#ff8fa3', '#6fd6c3', '#ab9cf5', '#e0a07f'];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
// 画面に並べる順番（月曜はじまり）。数字は Date.getDay() の曜日番号（0=日曜）
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

// 習慣が身につくまでの平均日数（ロンドン大学の研究より）
const HABIT_DAYS = 66;

// ----- データの形 -----
// {
//   habits: [{
//     id, name, emoji, color,
//     days: [1, 3, 5],          ← やる曜日（0=日曜 … 6=土曜）
//     createdAt: '2026-10-25',  ← 始めた日
//     doneDates: ['2026-10-25', ...],
//   }],
//   goals: { month: { '2026-10': '...' }, year: { '2026': '...' } }
// }
// 目標は「月ごと」「年ごと」に分けて残すので、あとでふりかえりに使える
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.habits)) {
      saved.habits.forEach(fillMissingFields);
      return saved;
    }
  } catch (e) {
    console.warn('保存データを読み込めませんでした', e);
  }
  return { habits: [], goals: { month: {}, year: {} } };
}

// 前の版で作った習慣には「曜日」「始めた日」がないので、ここで足しておく
function fillMissingFields(habit) {
  if (!Array.isArray(habit.days) || habit.days.length === 0) habit.days = [...EVERY_DAY];
  if (!habit.createdAt) habit.createdAt = [...habit.doneDates].sort()[0] || toKey(new Date());
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ----- 日付のヘルパー -----
// 'YYYY-MM-DD' の形にする（日本時間のまま扱うため、toISOString は使わない）
function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// その週の月曜日
function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

let state = loadState();

// =====================================================
// 習慣の計算（ホーム・ふりかえり・あとで作るエンドロールで使う）
// =====================================================
function isScheduled(habit, date) {
  return habit.days.includes(date.getDay());
}

// 「毎日」「金曜」「月・水・金曜」のような表示
function frequencyLabel(habit) {
  if (habit.days.length === 7) return '毎日';
  return WEEK_ORDER.filter((d) => habit.days.includes(d)).map((d) => WEEKDAYS[d]).join('・') + '曜';
}

// 連続の数え方の単位。毎日なら「日」、週1なら「週」、それ以外は「回」
function streakUnit(habit) {
  if (habit.days.length === 7) return '日';
  if (habit.days.length === 1) return '週';
  return '回';
}

// ----- 連続日数 -----
// ルール：予定の日に1回休んでもセーフ。2回続けて休んだらリセット。
// 今日の分は「まだチェックしていないだけ」なので、休みには数えない。
function getStreak(habit) {
  const done = new Set(habit.doneDates);
  const start = fromKey(habit.createdAt);
  const todayKey = toKey(today());

  let count = 0;
  let misses = 0;           // 続けて休んだ回数
  let lastWasMiss = false;  // いちばん最近の予定の日を休んだか
  let seenAny = false;

  for (let d = today(); d >= start; d = addDays(d, -1)) {
    const key = toKey(d);
    if (done.has(key)) {
      count++;
      misses = 0;
      seenAny = true;
    } else if (isScheduled(habit, d) && key !== todayKey) {
      if (!seenAny) lastWasMiss = true;
      seenAny = true;
      misses++;
      if (misses >= 2) break;
    }
  }
  // 連続が続いていて、前回だけ休んでいる → 「次は休めない」とお知らせする
  return { count, warning: count > 0 && lastWasMiss };
}

// いちばん長く続いた連続（同じルールで、始めた日から今日まで数える）
function getBestStreak(habit) {
  const done = new Set(habit.doneDates);
  const todayKey = toKey(today());
  let run = 0;
  let misses = 0;
  let best = 0;

  for (let d = fromKey(habit.createdAt); d <= today(); d = addDays(d, 1)) {
    const key = toKey(d);
    if (done.has(key)) {
      run++;
      misses = 0;
      best = Math.max(best, run);
    } else if (isScheduled(habit, d) && key !== todayKey) {
      misses++;
      if (misses >= 2) run = 0;
    }
  }
  return best;
}

// その年の記録：達成率（予定の日のうち、やった日の割合）と、やった日の合計
function getYearStats(habit, year) {
  const done = new Set(habit.doneDates);
  const todayKey = toKey(today());
  const startKey = habit.createdAt > `${year}-01-01` ? habit.createdAt : `${year}-01-01`;
  const end = new Date(Math.min(today(), new Date(year, 11, 31)));

  let planned = 0;
  let doneOnPlan = 0;
  for (let d = fromKey(startKey); d <= end; d = addDays(d, 1)) {
    const key = toKey(d);
    if (!isScheduled(habit, d)) continue;
    // 今日はチェックしていたら数える（まだなら、これからやるかもしれないので数えない）
    if (key === todayKey && !done.has(key)) continue;
    planned++;
    if (done.has(key)) doneOnPlan++;
  }

  const total = habit.doneDates.filter((k) => k.startsWith(`${year}-`)).length;
  const rate = planned ? Math.round((doneOnPlan / planned) * 100) : 0;
  return { rate, total };
}

// 今週（月〜日）の達成：予定の回数のうち何回できたか
function getWeekStats(habit) {
  const done = new Set(habit.doneDates);
  const start = fromKey(habit.createdAt);
  let planned = 0;
  let doneCount = 0;
  for (let d = mondayOf(today()), i = 0; i < 7; i++, d = addDays(d, 1)) {
    if (done.has(toKey(d))) doneCount++;
    if (d >= start && isScheduled(habit, d)) planned++;
  }
  return { planned, done: Math.min(doneCount, planned) };
}

// 始めてから何日目か（66日メーター用）
function daysSinceStart(habit) {
  return Math.round((today() - fromKey(habit.createdAt)) / 86400000) + 1;
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
let currentView = 'home';

function render() {
  if (currentView === 'home') renderHome();
  else renderReview();
}

// ----- ホーム画面 -----
function renderHome() {
  const now = today();
  const todayKey = toKey(now);

  $('today-label').textContent =
    `${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[now.getDay()]}）`;

  renderGoals(now);

  // 今日やる習慣と、今日は予定のない習慣に分ける
  const todays = state.habits.filter((h) => isScheduled(h, now));
  const rests = state.habits.filter((h) => !isScheduled(h, now));

  $('habit-list').innerHTML = todays.map((h) => habitRow(h, todayKey)).join('');
  $('rest-list').innerHTML = rests.map((h) => habitRow(h, todayKey)).join('');
  $('rest-section').classList.toggle('hidden', rests.length === 0);

  // 今日いくつできたか（今日やる習慣だけで数える）
  const doneCount = todays.filter((h) => h.doneDates.includes(todayKey)).length;
  $('progress-label').textContent = todays.length ? `${doneCount} / ${todays.length} できた` : '';

  $('empty-message').classList.toggle('hidden', state.habits.length > 0);
}

function habitRow(habit, todayKey) {
  const isDone = habit.doneDates.includes(todayKey);
  const streak = getStreak(habit);
  const unit = streakUnit(habit);

  let streakText = 'まだ連続なし';
  if (streak.count > 0) {
    streakText = `🔥 ${streak.count}${unit}連続`;
    if (streak.warning) streakText += ' ・ <span class="text-amber-300">次は休めない！</span>';
  }

  // 直近7日（左が6日前、右が今日）。予定のない日はうすく表示
  const dots = [6, 5, 4, 3, 2, 1, 0].map((n) => {
    const d = addDays(today(), -n);
    if (habit.doneDates.includes(toKey(d))) {
      return `<span class="week-dot" style="background:${habit.color}"></span>`;
    }
    return `<span class="week-dot ${isScheduled(habit, d) ? '' : 'is-off'}"></span>`;
  }).join('');

  return `
    <li class="habit-row">
      <button class="habit-emoji" data-edit="${habit.id}" style="background:${habit.color}26" aria-label="${escapeHtml(habit.name)}を編集">
        ${escapeHtml(habit.emoji || '⭐')}
      </button>
      <div class="flex-1 min-w-0" data-edit="${habit.id}">
        <p class="font-semibold truncate">${escapeHtml(habit.name)}</p>
        <p class="text-xs text-zinc-400 mt-0.5">${frequencyLabel(habit)} ・ ${streakText}</p>
        <div class="week-dots">${dots}</div>
      </div>
      <button class="check-button" data-toggle="${habit.id}"
        style="${isDone ? `background:${habit.color};border-color:${habit.color}` : ''}"
        aria-label="${escapeHtml(habit.name)}を${isDone ? '未完了にする' : '完了にする'}">
        ${isDone ? '✓' : ''}
      </button>
    </li>`;
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

// ----- ふりかえり画面 -----
function renderReview() {
  const year = today().getFullYear();
  $('review-title').textContent = `${year}年`;

  // 達成率が高い順に並べる
  const rows = state.habits
    .map((habit) => ({ habit, stats: getYearStats(habit, year) }))
    .sort((a, b) => b.stats.rate - a.stats.rate);

  $('review-list').innerHTML = rows.map(({ habit, stats }) => {
    const week = getWeekStats(habit);
    const best = getBestStreak(habit);
    const days = daysSinceStart(habit);
    const meterText = days >= HABIT_DAYS
      ? '🎓 66日たった！もう習慣になってきたころ'
      : `習慣が身につくまで ${days} / ${HABIT_DAYS}日`;

    return `
      <li class="review-card">
        <div class="flex items-center gap-3">
          <span class="habit-emoji" style="background:${habit.color}26">${escapeHtml(habit.emoji || '⭐')}</span>
          <div class="flex-1 min-w-0">
            <p class="font-semibold truncate">${escapeHtml(habit.name)}</p>
            <p class="text-xs text-zinc-400">${frequencyLabel(habit)}</p>
          </div>
          <p class="text-2xl font-bold" style="color:${habit.color}">${stats.rate}<span class="text-sm">%</span></p>
        </div>

        <div class="heatmap">${heatmapCells(habit, year)}</div>

        <p class="mt-3 text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>合計 <b class="text-zinc-100">${stats.total}</b>日</span>
          <span>最長 <b class="text-zinc-100">🔥 ${best}</b>${streakUnit(habit)}</span>
          <span>今週 ${week.planned
            ? `<b class="text-zinc-100">${week.done} / ${week.planned}</b>`
            : '予定なし'}</span>
        </p>

        <div class="mt-3">
          <p class="text-xs text-zinc-400 mb-1">${meterText}</p>
          <div class="meter"><span style="width:${Math.min(days / HABIT_DAYS, 1) * 100}%;background:${habit.color}"></span></div>
        </div>
      </li>`;
  }).join('');

  $('review-empty').classList.toggle('hidden', state.habits.length > 0);
}

// 1年分のマスを作る。たて7マス（月〜日）で1列＝1週間
function heatmapCells(habit, year) {
  const done = new Set(habit.doneDates);
  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const start = fromKey(habit.createdAt);
  const todayKey = toKey(today());
  const cells = [];

  // 1月1日がある週の月曜から、12月31日がある週の日曜まで
  for (let d = mondayOf(first); d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) {
    const key = toKey(d);
    let cls = 'heat-cell';
    let style = '';
    if (d.getFullYear() !== year) cls += ' is-blank';
    else if (done.has(key)) style = `background:${habit.color}`;
    else if (d < start || d > today()) cls += ' is-future';
    else if (!isScheduled(habit, d)) cls += ' is-off';
    if (key === todayKey) cls += ' is-today';
    cells.push(`<span class="${cls}" style="${style}" title="${key}"></span>`);
  }
  return cells.join('');
}

// ----- 下のタブで画面を切りかえる -----
function showView(name) {
  currentView = name;
  $('view-home').hidden = name !== 'home';
  $('view-review').hidden = name !== 'review';
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.classList.toggle('tab-active', tab.dataset.tab === name);
  });
  window.scrollTo(0, 0);
  render();
}

document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.tab));
});

// =====================================================
// チェックのオン・オフ
// =====================================================
function toggleToday(habitId) {
  const habit = state.habits.find((h) => h.id === habitId);
  if (!habit) return;
  const todayKey = toKey(today());
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
['habit-list', 'rest-list'].forEach((id) => {
  $(id).addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) return toggleToday(toggle.dataset.toggle);

    const edit = e.target.closest('[data-edit]');
    if (edit) openHabitDialog(edit.dataset.edit);
  });
});

// =====================================================
// 習慣の追加・編集
// =====================================================
let editingId = null;
let selectedColor = COLORS[0];
let selectedDays = new Set(EVERY_DAY);

function renderColorChoices() {
  $('color-choices').innerHTML = COLORS.map((color) => `
    <button type="button" class="color-choice" role="radio" data-color="${color}"
      aria-checked="${color === selectedColor}" style="background:${color}"></button>
  `).join('');
}

function renderDayChoices() {
  $('day-choices').innerHTML = WEEK_ORDER.map((day) => `
    <button type="button" class="day-chip" role="checkbox" data-day="${day}"
      aria-checked="${selectedDays.has(day)}">${WEEKDAYS[day]}</button>
  `).join('');
}

$('color-choices').addEventListener('click', (e) => {
  const choice = e.target.closest('[data-color]');
  if (!choice) return;
  selectedColor = choice.dataset.color;
  renderColorChoices();
});

$('day-choices').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-day]');
  if (!chip) return;
  const day = Number(chip.dataset.day);
  if (selectedDays.has(day)) selectedDays.delete(day);
  else selectedDays.add(day);
  renderDayChoices();
});

$('day-all').addEventListener('click', () => {
  selectedDays = new Set(EVERY_DAY);
  renderDayChoices();
});

function openHabitDialog(habitId = null) {
  const habit = state.habits.find((h) => h.id === habitId);
  editingId = habit ? habit.id : null;

  $('habit-dialog-title').textContent = habit ? '習慣を編集' : '習慣を追加';
  $('habit-name').value = habit ? habit.name : '';
  $('habit-emoji').value = habit ? habit.emoji : '';
  // 新しい習慣は、まだ使っていない色を自動で選ぶ
  selectedColor = habit ? habit.color : COLORS[state.habits.length % COLORS.length];
  selectedDays = new Set(habit ? habit.days : EVERY_DAY);
  $('habit-delete').classList.toggle('hidden', !habit);

  renderColorChoices();
  renderDayChoices();
  $('habit-dialog').showModal();
}

$('add-habit-button').addEventListener('click', () => openHabitDialog());
$('habit-cancel').addEventListener('click', () => $('habit-dialog').close());

$('habit-form').addEventListener('submit', (e) => {
  const name = $('habit-name').value.trim();
  if (!name) return;
  if (selectedDays.size === 0) {
    e.preventDefault(); // ダイアログを閉じずに、もう一度えらんでもらう
    alert('やる曜日を1つ以上えらんでください');
    return;
  }
  const emoji = $('habit-emoji').value.trim();
  const days = [...selectedDays].sort();

  if (editingId) {
    const habit = state.habits.find((h) => h.id === editingId);
    Object.assign(habit, { name, emoji, color: selectedColor, days });
  } else {
    state.habits.push({
      id: crypto.randomUUID(),
      name,
      emoji,
      color: selectedColor,
      days,
      createdAt: toKey(today()),
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
  const now = today();
  return kind === 'month' ? toKey(now).slice(0, 7) : String(now.getFullYear());
}

document.querySelectorAll('.goal-card').forEach((card) => {
  card.addEventListener('click', () => {
    editingGoalKind = card.dataset.kind;
    const now = today();
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

// =====================================================
// オフライン対応：お留守番係（sw.js）を登録する
// =====================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => {
    console.warn('オフライン対応の準備に失敗しました', e);
  });
}
