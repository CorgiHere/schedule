'use strict';

const KEY = 'corgihere.schedule.v1';
const SYNC_URL = 'https://crudcrud.com/api/4e3c069004d74b328917de3bf884bf9b/state/6adff68b419cd403e8b1dba4';

function stamp() {
  return Math.floor(Date.now() / 1000);
}

function safeStamp(value) {
  const n = typeof value === 'number' ? value : 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e10 ? Math.floor(n / 1000) : Math.floor(n);
}

const COURSES = [
  { id: 'cp', code: 'CP', name: 'Competitive Programming I', color: '#1d4ed8' },
  { id: 'src', code: 'SRC', name: 'Selected Readings of Changes', color: '#2563eb' },
  { id: 'sr', code: 'SR', name: 'Scientific Revolution', color: '#0284c7' },
  { id: 'ds', code: 'DS', name: 'Data Structures', color: '#1e40af' },
  { id: 'tps', code: 'TPS', name: 'Taiwanese Popular Songs and Society', color: '#0369a1' },
];

const WEEKS = [
  { id: 'W07', start: '2026-10-25', end: '2026-10-31' },
  { id: 'W08', start: '2026-11-01', end: '2026-11-07' },
  { id: 'W09', start: '2026-11-08', end: '2026-11-14', quiet: true },
  { id: 'W10', start: '2026-11-15', end: '2026-11-21' },
  { id: 'W11', start: '2026-11-22', end: '2026-11-28' },
  { id: 'W12', start: '2026-11-29', end: '2026-12-05' },
  { id: 'W13', start: '2026-12-06', end: '2026-12-12', quiet: true },
  { id: 'W14', start: '2026-12-13', end: '2026-12-19' },
  { id: 'W15', start: '2026-12-20', end: '2026-12-26' },
];

const SEASON_START = '2026-10-25';
const SEASON_END = '2026-12-26';

const BASE = [
  ['cp-mid', 'cp', '2026-11-06', 'Midterm', '期中考'],
  ['cp-final', 'cp', '2026-12-18', 'Final', '期末考'],
  ['src-mid', 'src', '2026-10-27', 'Midterm', '期中考'],
  ['src-test', 'src', '2026-11-24', 'Test', '測驗'],
  ['src-final', 'src', '2026-12-22', 'Final', '期末考'],
  ['sr-mid', 'sr', '2026-10-30', 'Midterm', '期中考'],
  ['sr-report', 'sr', '2026-12-04', 'Report', '報告'],
  ['sr-final', 'sr', '2026-12-18', 'Final', '期末考'],
  ['ds-mid', 'ds', '2026-10-27', 'Midterm', '期中考'],
  ['ds-q3', 'ds', '2026-11-04', 'Quiz-C 3', '小考 C3'],
  ['ds-q4', 'ds', '2026-11-18', 'Quiz-C 4', '小考 C4'],
  ['ds-proj', 'ds', '2026-11-24', 'Project', '專題'],
  ['ds-q5', 'ds', '2026-12-02', 'Quiz-C 5', '小考 C5'],
  ['ds-final', 'ds', '2026-12-15', 'Final', '期末考'],
  ['tps-report', 'tps', '2026-10-27', 'Report', '報告'],
  ['tps-mid', 'tps', '2026-11-05', 'Midterm', '期中考'],
  ['tps-final', 'tps', '2026-12-24', 'Final', '期末考'],
].map(([id, course, date, kind, label]) => ({ id, course, date, kind, label, custom: false }));

const TAGS = ['考試', '小考', '作業', '報告', '專題', '讀書', '其他'];

function tagOf(kind) {
  if (TAGS.includes(kind)) return kind;
  const value = String(kind || '').toLowerCase();
  if (value.startsWith('quiz')) return '小考';
  if (value === 'report') return '報告';
  if (value === 'project') return '專題';
  if (value === 'test' || value === 'midterm' || value === 'final') return '考試';
  return '其他';
}

const NOTE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const state = loadState();
let applyingRemote = false;
let pushTimer = 0;
let pushing = false;
let pushAgain = false;
let lastPushedAt = 0;
const openNotes = new Set(Object.keys(state.notes).filter((id) => state.notes[id]));
let view = 'upcoming';
let courseFilter = '';
let query = '';
let printMode = false;
let toastTimer = 0;
let selectedDate = '';
let selectedWeek = '';
let editingId = '';
const calNow = new Date();
let calYear = calNow.getFullYear();
let calMonth = calNow.getMonth();

function loadState() {
  const empty = { done: {}, notes: {}, custom: [], added: [], removed: [], hidden: [], colors: {}, profiles: {}, edits: {}, theme: null, hideDone: false, updatedAt: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const removed = sanitizeRemoved(raw.removed);
    const added = sanitizeAdded(raw.added);
    const colors = sanitizeColors(raw.colors);
    const profiles = sanitizeProfiles(raw.profiles);
    const ids = courseIdSet(removed, added);
    return {
      done: raw.done && typeof raw.done === 'object' ? raw.done : {},
      notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
      custom: Array.isArray(raw.custom) ? sanitizeCustom(raw.custom, ids) : [],
      added,
      removed,
      colors,
      profiles,
      edits: sanitizeEdits(raw.edits, ids),
      hidden: sanitizeHidden(raw.hidden),
      theme: raw.theme === 'dark' || raw.theme === 'light' ? raw.theme : null,
      hideDone: !!raw.hideDone,
      updatedAt: safeStamp(raw.updatedAt),
    };
  } catch (err) {
    return empty;
  }
}

function saveState() {
  state.updatedAt = stamp();
  writeState();
  schedulePush();
}

function writeState() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function snapshotFrom(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const removed = sanitizeRemoved(source.removed);
  const added = sanitizeAdded(source.added);
  const ids = courseIdSet(removed, added);
  return {
    done: source.done && typeof source.done === 'object' ? source.done : {},
    notes: source.notes && typeof source.notes === 'object' ? source.notes : {},
    custom: Array.isArray(source.custom) ? sanitizeCustom(source.custom, ids) : [],
    added,
    removed,
    colors: sanitizeColors(source.colors),
    profiles: sanitizeProfiles(source.profiles),
    edits: sanitizeEdits(source.edits, ids),
    hidden: sanitizeHidden(source.hidden),
    theme: source.theme === 'dark' || source.theme === 'light' ? source.theme : null,
    hideDone: !!source.hideDone,
    updatedAt: safeStamp(source.updatedAt),
  };
}

function stateWeight(snapshot) {
  return Object.keys(snapshot.done).length
    + Object.keys(snapshot.notes).length
    + snapshot.custom.length
    + snapshot.added.length
    + snapshot.removed.length
    + Object.keys(snapshot.edits).length
    + snapshot.hidden.length
    + Object.keys(snapshot.profiles).length
    + Object.keys(snapshot.colors).length;
}

function payloadFromState() {
  return {
    done: state.done,
    notes: state.notes,
    custom: state.custom,
    added: state.added,
    removed: state.removed,
    colors: state.colors,
    profiles: state.profiles,
    edits: state.edits,
    hidden: state.hidden,
    theme: state.theme,
    hideDone: state.hideDone,
    updatedAt: state.updatedAt || 0,
  };
}

function setSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = text;
}

async function readRemote() {
  const res = await fetch(SYNC_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('status');
  return snapshotFrom(await res.json());
}

async function writeRemote() {
  const res = await fetch(SYNC_URL, {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFromState()),
  });
  if (!res.ok) throw new Error('status');
  lastPushedAt = state.updatedAt || 0;
}

function applyRemote(snapshot) {
  applyingRemote = true;
  state.done = snapshot.done;
  state.notes = snapshot.notes;
  state.custom = snapshot.custom;
  state.added = snapshot.added;
  state.removed = snapshot.removed;
  state.colors = snapshot.colors;
  state.profiles = snapshot.profiles;
  state.edits = snapshot.edits;
  state.hidden = snapshot.hidden;
  state.theme = snapshot.theme;
  state.hideDone = snapshot.hideDone;
  state.updatedAt = snapshot.updatedAt;
  writeState();
  applyTheme();
  const hideDone = document.getElementById('hideDone');
  if (hideDone) hideDone.checked = state.hideDone;
  openNotes.clear();
  Object.keys(state.notes).forEach((id) => { if (state.notes[id]) openNotes.add(id); });
  render();
  applyingRemote = false;
  setSyncStatus('已和其他裝置同步');
}

function schedulePush() {
  if (applyingRemote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 800);
}

async function pushState() {
  if (applyingRemote) return;
  if (pushing) {
    pushAgain = true;
    return;
  }
  pushing = true;
  setSyncStatus('同步中');
  try {
    const remote = await readRemote();
    const remoteNewer = remote.updatedAt > (state.updatedAt || 0);
    const localIsLegacy = !state.updatedAt && stateWeight(state) > stateWeight(remote);
    if (remoteNewer && !localIsLegacy) {
      applyRemote(remote);
      return;
    }
    if (!state.updatedAt) state.updatedAt = stamp();
    await writeRemote();
    writeState();
    setSyncStatus('已和其他裝置同步');
  } catch (err) {
    setSyncStatus('這台已存好，和其他裝置還沒連上');
  } finally {
    pushing = false;
    if (pushAgain) {
      pushAgain = false;
      schedulePush();
    }
  }
}

async function pullAndMerge() {
  if (applyingRemote || pushing) return;
  let remote;
  try {
    remote = await readRemote();
  } catch (err) {
    setSyncStatus('這台已存好，和其他裝置還沒連上');
    return;
  }
  const localAt = state.updatedAt || 0;
  const remoteAt = remote.updatedAt || 0;
  const localWeight = stateWeight(state);
  const remoteWeight = stateWeight(remote);
  if (!localAt && localWeight > remoteWeight) {
    state.updatedAt = stamp();
    writeState();
    pushState();
    return;
  }
  if (remoteAt > localAt) {
    applyRemote(remote);
    return;
  }
  if (localAt > remoteAt || (localWeight && !remoteWeight)) {
    if (!state.updatedAt) {
      state.updatedAt = stamp();
      writeState();
    }
    if (lastPushedAt !== state.updatedAt) pushState();
    else setSyncStatus('已和其他裝置同步');
    return;
  }
  setSyncStatus(localWeight || remoteWeight ? '已和其他裝置同步' : '改完會同步到其他裝置');
}

function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '';
}

function sanitizeHidden(list) {
  if (!Array.isArray(list)) return [];
  const known = new Set(BASE.map((event) => event.id));
  return [...new Set(list.filter((id) => known.has(id)))];
}

function sanitizeRemoved(list) {
  if (!Array.isArray(list)) return [];
  const known = new Set(COURSES.map((course) => course.id));
  return [...new Set(list.filter((id) => known.has(id)))];
}

function sanitizeAdded(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set(COURSES.map((course) => course.id));
  return list.map((item) => {
    if (!item || typeof item.code !== 'string') return null;
    const code = item.code.trim().slice(0, 12);
    if (!code) return null;
    let id = typeof item.id === 'string' && item.id.startsWith('course-') ? item.id : 'course-' + crypto.randomUUID();
    if (used.has(id)) id = 'course-' + crypto.randomUUID();
    used.add(id);
    return {
      id,
      code,
      name: typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '',
      color: validColor(item.color) || '#2563eb',
    };
  }).filter(Boolean);
}

function sanitizeColors(raw) {
  const colors = {};
  if (!raw || typeof raw !== 'object') return colors;
  Object.keys(raw).forEach((id) => {
    const color = validColor(raw[id]);
    if (color && /^[a-z0-9-]{1,40}$/.test(id)) colors[id] = color;
  });
  return colors;
}

function sanitizeProfiles(raw) {
  const profiles = {};
  if (!raw || typeof raw !== 'object') return profiles;
  Object.keys(raw).forEach((id) => {
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return;
    const item = raw[id];
    if (!item || typeof item !== 'object') return;
    const code = typeof item.code === 'string' ? item.code.trim().slice(0, 12) : '';
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : '';
    if (!code && !Object.prototype.hasOwnProperty.call(item, 'name')) return;
    profiles[id] = {};
    if (code) profiles[id].code = code;
    if (Object.prototype.hasOwnProperty.call(item, 'name')) profiles[id].name = name;
  });
  return profiles;
}

function sanitizeEdits(raw, ids) {
  const edits = {};
  const baseIds = new Set(BASE.map((event) => event.id));
  if (!raw || typeof raw !== 'object') return edits;
  Object.keys(raw).forEach((id) => {
    if (!baseIds.has(id)) return;
    const item = raw[id];
    if (!item || typeof item !== 'object') return;
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 80) : '';
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return;
    edits[id] = {
      label,
      date: item.date,
      kind: tagOf(item.kind),
      course: ids.has(item.course) ? item.course : '',
    };
  });
  return edits;
}

function courseIdSet(removed, added) {
  const hide = new Set(removed || []);
  const ids = new Set(COURSES.map((course) => course.id).filter((id) => !hide.has(id)));
  (added || []).forEach((course) => ids.add(course.id));
  return ids;
}

function sanitizeCustom(list, ids) {
  const known = ids || courseIdSet(state.removed, state.added);
  return list
    .filter((item) => item && typeof item.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.startsWith('custom-') ? item.id : 'custom-' + crypto.randomUUID(),
      title: item.title.trim().slice(0, 80),
      date: item.date,
      kind: tagOf(item.kind),
      course: known.has(item.course) ? item.course : '',
    }))
    .filter((item) => item.title);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(iso) {
  const diff = parseISO(iso) - startOfDay(new Date());
  return Math.round(diff / 86400000);
}

function shortDate(iso) {
  const date = parseISO(iso);
  return date.getMonth() + 1 + '/' + date.getDate();
}

function longDate(iso) {
  const date = parseISO(iso);
  return date.getMonth() + 1 + '月' + date.getDate() + '日 · 週' + '日一二三四五六'[date.getDay()];
}

function whenText(iso) {
  const days = daysUntil(iso);
  if (days < 0) return '逾期 ' + -days + ' 天';
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '後天';
  return days + ' 天';
}

function whenClass(iso) {
  const days = daysUntil(iso);
  if (days < 0) return 'is-late';
  if (days === 0) return 'is-today';
  return '';
}

function weekOf(iso) {
  const time = parseISO(iso).getTime();
  return WEEKS.find((week) => time >= parseISO(week.start).getTime() && time <= parseISO(week.end).getTime()) || null;
}

function activeCourses() {
  const builtin = COURSES.filter((course) => !state.removed.includes(course.id)).map((course) => {
    const profile = state.profiles[course.id] || {};
    return {
      id: course.id,
      code: profile.code || course.code,
      name: Object.prototype.hasOwnProperty.call(profile, 'name') ? profile.name : course.name,
      color: state.colors[course.id] || course.color,
    };
  });
  const extra = state.added.map((course) => ({
    id: course.id,
    code: course.code,
    name: course.name || '',
    color: state.colors[course.id] || course.color,
  }));
  return builtin.concat(extra);
}

function courseById(id) {
  return activeCourses().find((course) => course.id === id) || null;
}

function courseIndex(id) {
  const index = activeCourses().findIndex((course) => course.id === id);
  return index === -1 ? 99 : index;
}

function labelOf(event) {
  return event.label || event.title || event.kind || '事項';
}

function courseLabel(course) {
  if (!course) return '';
  return course.name ? course.code + ' · ' + course.name : course.code;
}

function allEvents() {
  const hidden = new Set(state.hidden);
  const base = BASE.filter((event) => !hidden.has(event.id)).map((event) => {
    const edit = state.edits[event.id];
    const course = edit ? (edit.course && courseById(edit.course) ? edit.course : '') : event.course;
    return {
      ...event,
      label: edit ? edit.label : event.label,
      date: edit ? edit.date : event.date,
      kind: tagOf(edit ? edit.kind : event.kind),
      course,
    };
  });
  const custom = state.custom.map((item) => ({
    id: item.id,
    course: item.course || '',
    date: item.date,
    kind: tagOf(item.kind),
    label: item.title,
    title: item.title,
    custom: true,
  }));
  return base.concat(custom).filter((event) => !event.course || courseById(event.course)).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const courseDelta = courseIndex(a.course) - courseIndex(b.course);
    if (courseDelta) return courseDelta;
    return labelOf(a).localeCompare(labelOf(b), 'zh-Hant');
  });
}

function matchQuery(event, q) {
  const course = courseById(event.course);
  const week = weekOf(event.date);
  const blob = [
    labelOf(event),
    event.kind,
    event.date,
    shortDate(event.date),
    course ? course.code : '',
    course ? course.name : '',
    week ? week.id : '',
    state.notes[event.id] || '',
  ].join(' ').toLowerCase();
  return blob.includes(q.toLowerCase());
}

function relevant(event) {
  if (daysUntil(event.date) >= 0) return true;
  return !state.done[event.id];
}

function applyFilters(events, viewName) {
  const q = query.trim();
  return events.filter((event) => {
    if (printMode) return true;
    if (viewName === 'day') {
      if (event.date !== selectedDate) return false;
    } else if (viewName === 'week' || (selectedWeek && !selectedDate && viewName !== 'courses')) {
      const found = weekOf(event.date);
      if (!found || found.id !== selectedWeek) return false;
    } else if (selectedDate && event.date !== selectedDate) {
      return false;
    } else if (viewName === 'upcoming' && !relevant(event)) {
      return false;
    }
    if (state.hideDone && state.done[event.id]) return false;
    if (courseFilter && event.course !== courseFilter) return false;
    if (q && !matchQuery(event, q)) return false;
    return true;
  });
}

function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function focusList() {
  if (!matchMedia('(max-width: 980px)').matches) return;
  const list = document.getElementById('list');
  const bar = document.querySelector('.topbar');
  list.style.scrollMarginTop = (bar ? bar.offsetHeight : 56) + 8 + 'px';
  list.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function applyTheme() {
  const theme = state.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  const meta = document.getElementById('themeColor');
  if (meta) meta.content = theme === 'dark' ? '#0b1220' : '#ffffff';
  const button = document.getElementById('themeBtn');
  const dark = theme === 'dark';
  button.textContent = dark ? '淺色' : '深色';
  button.setAttribute('aria-pressed', String(dark));
  button.title = dark ? '切換淺色' : '切換深色';
}

function setHash() {
  try { history.replaceState(null, '', '#' + view); } catch (err) {}
}

function setView(next) {
  view = next;
  if (next !== 'upcoming') {
    selectedDate = '';
    selectedWeek = '';
  }
  setHash();
  render();
}

function syncViewButtons() {
  document.querySelectorAll('.view-btn').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

function syncChips() {
  document.querySelectorAll('.chip').forEach((button) => {
    button.setAttribute('aria-pressed', String((button.dataset.course || '') === courseFilter));
  });
}

function paintFilterNote() {
  const el = document.getElementById('filterNote');
  const on = courseFilter || query.trim() || state.hideDone || selectedDate || selectedWeek;
  el.hidden = !on;
  const bits = [];
  if (selectedWeek) bits.push(selectedWeek);
  if (selectedDate) bits.push(shortDate(selectedDate));
  if (courseFilter) {
    const course = courseById(courseFilter);
    if (course) bits.push(course.code);
  }
  if (query.trim()) bits.push('搜尋');
  if (state.hideDone) bits.push('隱藏已完成');
  document.getElementById('filterText').textContent = bits.join(' · ') || '篩選中';
}

function clearFilters() {
  courseFilter = '';
  query = '';
  selectedDate = '';
  selectedWeek = '';
  document.getElementById('q').value = '';
  state.hideDone = false;
  document.getElementById('hideDone').checked = false;
  saveState();
  syncChips();
  render();
}

function renderSeason() {
  const today = startOfDay(new Date());
  const start = parseISO(SEASON_START);
  const end = parseISO(SEASON_END);
  let ratio = (today - start) / (end - start);
  ratio = Math.min(1, Math.max(0, ratio));
  document.getElementById('seasonDot').style.left = (ratio * 100) + '%';

  let note;
  if (today < start) {
    const days = Math.round((start - today) / 86400000);
    note = days === 1 ? 'W07 明天開始' : 'W07 ' + days + ' 天後開始';
  } else if (today > end) {
    note = '已結束';
  } else {
    const week = weekOf(isoToday());
    note = week ? week.id : '進行中';
  }
  document.getElementById('seasonNote').textContent = note;
  const now = new Date();
  document.getElementById('todayLine').textContent = shortDate(isoToday()) + ' 週' + '日一二三四五六'[now.getDay()];
}

function focusGroup(events) {
  const pending = events.filter((event) => !state.done[event.id]);
  const pool = pending.filter((event) => daysUntil(event.date) < 0);
  const source = pool.length ? pool : pending.filter((event) => daysUntil(event.date) >= 0);
  if (!source.length) return null;
  const date = source[0].date;
  return { date, items: source.filter((event) => event.date === date) };
}

function renderHero(events) {
  const focus = focusGroup(events);
  const hero = document.getElementById('hero');
  if (!focus) {
    hero.innerHTML = '<div class="next"><p class="next-kicker">下次</p><p class="next-num">完成</p><p class="next-date">沒有未完成的項目</p></div>';
    return;
  }

  const days = daysUntil(focus.date);
  const kicker = days < 0 ? '逾期' : '下次';
  const big = days < 0 ? String(-days) : days === 0 ? '今天' : days === 1 ? '明天' : String(days);
  const unit = days < 0 ? '天前' : days > 1 ? '天' : '';
  const items = focus.items.map((event) => {
    const course = courseById(event.course);
    const color = course ? course.color : '#2563eb';
    const code = course ? course.code : '自訂';
    return '<li><span class="badge" style="--c:' + color + '">' + esc(code) + '</span><span>' + esc(labelOf(event)) + '</span></li>';
  }).join('');
  const dateLine = shortDate(focus.date) + ' · 週' + '日一二三四五六'[parseISO(focus.date).getDay()] + (focus.items.length > 1 ? ' · ' + focus.items.length + ' 項' : '');

  hero.innerHTML = '<div class="next"><p class="next-kicker">' + kicker + '</p><p class="next-num">' + esc(big) + (unit ? '<span>' + unit + '</span>' : '') + '</p><p class="next-date">' + esc(dateLine) + '</p><ul>' + items + '</ul></div>';
}

function renderRush(events) {
  const groups = new Map();
  events.forEach((event) => {
    if (daysUntil(event.date) < 0) return;
    if (!groups.has(event.date)) groups.set(event.date, []);
    groups.get(event.date).push(event);
  });
  const rush = [...groups.entries()].filter((entry) => entry[1].length >= 2);
  const mount = document.getElementById('rush');
  if (!rush.length) {
    mount.innerHTML = '';
    return;
  }
  const buttons = rush.map(([date, items]) => {
    return '<button type="button" data-jump="' + date + '"><span class="d">' + esc(shortDate(date)) + '</span><span class="s">' + items.length + ' 項</span></button>';
  }).join('');
  mount.innerHTML = '<p class="side-label">同一天</p><div class="rush-row">' + buttons + '</div>';
}

function renderStats(events) {
  const pending = events.filter((event) => !state.done[event.id]);
  const soon = pending.filter((event) => {
    const days = daysUntil(event.date);
    return days >= 0 && days <= 7;
  }).length;
  const overdue = pending.filter((event) => daysUntil(event.date) < 0).length;
  const parts = [events.length + ' 項', '完成 ' + (events.length - pending.length)];
  if (overdue) parts.push('逾期 ' + overdue);
  parts.push('7 天內 ' + soon);
  document.getElementById('stats').textContent = parts.join(' · ');
}

function itemHTML(event) {
  const course = courseById(event.course);
  const color = course ? course.color : '#2563eb';
  const code = course ? course.code : '自訂';
  const done = !!state.done[event.id];
  const note = state.notes[event.id] || '';
  const showNote = printMode ? !!note : openNotes.has(event.id);
  const preview = !showNote && note ? '<p class="note-preview">' + esc(note) + '</p>' : '';
  const editor = '<div class="note"' + (showNote ? '' : ' hidden') + '><label class="sr-only" for="note-' + esc(event.id) + '">備註</label><textarea id="note-' + esc(event.id) + '" data-id="' + esc(event.id) + '" maxlength="2000" placeholder="備註">' + esc(note) + '</textarea></div>';
  const remove = '<button type="button" class="mini" data-action="delete">刪除</button>';
  const noted = !!note.trim();
  const tools = '<div class="item-tools"><label class="tick"><input type="checkbox" data-action="toggle"' + (done ? ' checked' : '') + ' aria-label="' + (done ? '已完成' : '完成') + '"></label><button type="button" class="icon-btn note-btn' + (noted ? ' is-on' : '') + '" data-action="note" aria-label="備註" aria-expanded="' + showNote + '" title="備註">' + NOTE_ICON + '</button></div>';
  const loose = !course && event.custom ? '<span class="meta">未指定</span>' : '';
  return '<article class="item' + (done ? ' is-done' : '') + '" data-id="' + esc(event.id) + '">' + tools + '<div class="item-main"><button type="button" class="item-title" data-action="edit">' + esc(labelOf(event)) + '</button><span class="badge" style="--c:' + color + '">' + esc(code) + '</span><span class="pill">' + esc(tagOf(event.kind)) + '</span>' + loose + '</div><div class="item-end"><span class="when ' + whenClass(event.date) + '">' + esc(whenText(event.date)) + '</span>' + remove + '</div>' + preview + editor + '</article>';
}

function dayBlock(date, items, scope) {
  const dateObj = parseISO(date);
  const extra = items.length > 1 ? ' · ' + items.length : '';
  const idAttr = scope ? '' : ' id="day-' + date + '"';
  return '<section class="day"' + idAttr + '><div class="day-label"><span class="n">' + shortDate(date) + '</span><span class="day-meta">週' + '日一二三四五六'[dateObj.getDay()] + extra + '</span></div><div>' + items.map(itemHTML).join('') + '</div></section>';
}

function groupByDate(events) {
  const groups = [];
  events.forEach((event) => {
    const last = groups[groups.length - 1];
    if (!last || last.date !== event.date) groups.push({ date: event.date, items: [event] });
    else last.items.push(event);
  });
  return groups;
}

function upcomingHTML(events) {
  const visible = applyFilters(events, 'upcoming');
  if (!visible.length) return emptyHTML();
  let html = '';
  let lastWeek = '';
  groupByDate(visible).forEach((group) => {
    const week = weekOf(group.date);
    const weekId = week ? week.id : 'other';
    if (weekId !== lastWeek) {
      lastWeek = weekId;
      const now = weekOf(isoToday());
      const tag = now && week && now.id === week.id ? '<span class="tag now">本週</span>' : '';
      const title = week ? week.id : '其他日期';
      const range = week ? shortDate(week.start) + ' – ' + shortDate(week.end) : '';
      html += '<div class="divider" id="jump-' + esc(weekId) + '"><span class="wk">' + esc(title) + '</span><span class="range">' + esc(range) + '</span>' + tag + '</div>';
    }
    html += dayBlock(group.date, group.items);
  });
  return html;
}

function weeksHTML(events) {
  const visible = applyFilters(events, 'weeks');
  let html = '';
  WEEKS.forEach((week) => {
    const items = visible.filter((event) => {
      const found = weekOf(event.date);
      return found && found.id === week.id;
    });
    const now = weekOf(isoToday());
    const tag = now && now.id === week.id ? '<span class="tag now">本週</span>' : '';
    html += '<section class="chapter" id="week-' + week.id + '"><div class="divider"><span class="wk">' + week.id + '</span><span class="range">' + shortDate(week.start) + ' – ' + shortDate(week.end) + '</span>' + tag + '</div>';
    if (!items.length) {
      const filtered = courseFilter || query.trim() || state.hideDone;
      html += '<p class="quiet">' + (week.quiet && !filtered ? '沒有安排' : '沒有符合的項目') + '</p>';
    } else {
      groupByDate(items).forEach((group) => { html += dayBlock(group.date, group.items); });
    }
    html += '</section>';
  });

  const outside = visible.filter((event) => !weekOf(event.date));
  if (outside.length) {
    html += '<section class="chapter" id="week-other"><div class="divider"><span class="wk">其他</span><span class="range">其他日期</span></div>';
    groupByDate(outside).forEach((group) => { html += dayBlock(group.date, group.items); });
    html += '</section>';
  }
  return html || emptyHTML();
}

function weekListHTML(events) {
  const week = WEEKS.find((item) => item.id === selectedWeek);
  if (!week) return emptyHTML();
  const items = applyFilters(events, 'week');
  const now = weekOf(isoToday());
  const tag = now && now.id === week.id ? '<span class="tag now">本週</span>' : '';
  let html = '<div class="divider"><span class="wk">' + week.id + '</span><span class="range">' + shortDate(week.start) + ' – ' + shortDate(week.end) + '</span>' + tag + '</div>';
  if (!items.length) {
    const filtered = courseFilter || query.trim() || state.hideDone;
    html += '<p class="quiet">' + (week.quiet && !filtered ? '沒有安排' : '沒有符合的項目') + '</p>';
    return html;
  }
  groupByDate(items).forEach((group) => { html += dayBlock(group.date, group.items); });
  return html;
}

function coursesHTML(events) {
  const visible = applyFilters(events, 'courses');
  const catalog = activeCourses();
  if (!visible.length && !catalog.length) return emptyHTML();
  const sections = catalog.map((course) => ({ course, items: visible.filter((event) => event.course === course.id) }));
  const loose = visible.filter((event) => !event.course);
  let html = '';
  sections.forEach(({ course, items }) => {
    if (!items.length && (courseFilter || query.trim() || state.hideDone)) return;
    const all = events.filter((event) => event.course === course.id);
    const doneCount = all.filter((event) => state.done[event.id]).length;
    const next = all.find((event) => !state.done[event.id]);
    const nextLine = !all.length ? '沒有項目' : next ? '下次 ' + shortDate(next.date) + ' ' + labelOf(next) + ' · ' + whenText(next.date) : '已完成';
    const width = all.length ? Math.round((doneCount / all.length) * 100) : 0;
    const name = course.name ? '<span class="course-name">' + esc(course.name) + '</span>' : '';
    const days = items.length ? groupByDate(items).map((group) => dayBlock(group.date, group.items, course.id)).join('') : '<p class="quiet">沒有符合的項目</p>';
    html += '<section class="course" id="course-' + course.id + '"><div class="course-h"><h2><span class="badge" style="--c:' + course.color + '">' + esc(course.code) + '</span>' + name + '</h2><button type="button" class="icon-btn" data-edit-course="' + esc(course.id) + '" aria-label="修改 ' + esc(course.code) + '" title="修改">' + NOTE_ICON + '</button><span class="count">' + doneCount + '/' + all.length + '</span></div><p class="next">' + esc(nextLine) + '</p><div class="progress" aria-hidden="true"><span style="width:' + width + '%"></span></div>' + days + '</section>';
  });
  if (loose.length) {
    html += '<section class="course" id="course-custom"><div class="course-h"><h2>未指定課程</h2></div>' + loose.map(itemHTML).join('') + '</section>';
  }
  return html || emptyHTML();
}

function emptyHTML(message) {
  return '<div class="empty"><p>' + esc(message || '沒有符合的項目') + '</p></div>';
}

function pad2(number) {
  return String(number).padStart(2, '0');
}

function isoFromParts(year, month, day) {
  return year + '-' + pad2(month + 1) + '-' + pad2(day);
}

function shiftMonth(delta) {
  const next = new Date(calYear, calMonth + delta, 1);
  calYear = next.getFullYear();
  calMonth = next.getMonth();
}

function renderCalendar(events) {
  const mount = document.getElementById('calendar');
  const first = new Date(calYear, calMonth, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = isoToday();
  const byDate = new Map();
  events.forEach((event) => {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  });
  const thisWeek = weekOf(today);
  const weekLeft = thisWeek
    ? events.filter((event) => {
      const found = weekOf(event.date);
      return found && found.id === thisWeek.id && !state.done[event.id];
    }).length
    : 0;

  const slots = [];
  for (let i = 0; i < startPad; i += 1) slots.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) slots.push(day);
  while (slots.length % 7) slots.push(null);

  let cells = '';
  for (let row = 0; row < slots.length; row += 7) {
    const days = slots.slice(row, row + 7);
    const isos = days.filter(Boolean).map((day) => isoFromParts(calYear, calMonth, day));
    const week = isos.map((iso) => weekOf(iso)).find(Boolean) || null;
    cells += weekLabel(events, week, thisWeek);
    days.forEach((day) => {
      if (!day) {
        cells += '<span></span>';
        return;
      }
      const iso = isoFromParts(calYear, calMonth, day);
      const items = byDate.get(iso) || [];
      const found = weekOf(iso);
      const classes = ['cal-cell'];
      if (iso === today) classes.push('is-today');
      if (iso === selectedDate) classes.push('is-on');
      if (items.length) classes.push('has');
      if (thisWeek && found && found.id === thisWeek.id) classes.push('is-week');
      if (selectedWeek && found && found.id === selectedWeek) classes.push('is-picked');
      const label = (calMonth + 1) + '月' + day + '日' + (found ? '，' + found.id : '') + (items.length ? '，' + items.length + '項' : '');
      cells += '<button type="button" class="' + classes.join(' ') + '" data-date="' + iso + '" aria-label="' + label + '" aria-pressed="' + (iso === selectedDate) + '">' + day + '</button>';
    });
  }

  const detail = calendarDetail(events, byDate);
  mount.innerHTML = '<div class="cal-card"><div class="cal-nav"><button type="button" data-cal="prev" aria-label="上個月">‹</button><strong>' + calYear + '年' + (calMonth + 1) + '月</strong><span class="cal-actions"><button type="button" data-cal="today">今天</button><button type="button" data-cal="next" aria-label="下個月">›</button></span></div><p class="cal-week">' + (thisWeek ? thisWeek.id + ' 還有 ' + weekLeft + ' 項' : '10/25–12/26') + '</p><div class="cal-dows"><span></span><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="cal-grid">' + cells + '</div></div>' + detail;
}

function weekLabel(events, week, thisWeek) {
  if (!week) return '<span class="cal-wk"></span>';
  const count = events.filter((event) => {
    const found = weekOf(event.date);
    return found && found.id === week.id;
  }).length;
  const classes = ['cal-wk'];
  if (selectedWeek === week.id) classes.push('is-on');
  if (thisWeek && thisWeek.id === week.id) classes.push('is-now');
  const label = week.id + '，' + shortDate(week.start) + '到' + shortDate(week.end) + (count ? '，' + count + '項' : '，沒有安排');
  return '<button type="button" class="' + classes.join(' ') + '" data-week="' + week.id + '" aria-label="' + label + '" aria-pressed="' + (selectedWeek === week.id) + '">' + week.id + '</button>';
}

function calendarDetail(events, byDate) {
  if (selectedWeek && !selectedDate) return weekDetail(events);
  if (!selectedDate) {
    const focus = focusGroup(events);
    if (!focus) return '<div class="cal-detail"><p>下次</p><p class="cal-hint">沒有未完成的項目</p></div>';
    const lines = focus.items.map((event) => {
      const course = courseById(event.course);
      const code = course ? course.code : '自訂';
      const color = course ? course.color : '#2563eb';
      return '<li><span class="badge" style="--c:' + color + '">' + esc(code) + '</span><span>' + esc(labelOf(event)) + '</span></li>';
    }).join('');
    return '<div class="cal-detail"><p>下次 ' + esc(shortDate(focus.date)) + '</p><ul class="cal-list">' + lines + '</ul></div>';
  }

  const items = byDate.get(selectedDate) || [];
  const date = parseISO(selectedDate);
  const head = shortDate(selectedDate) + ' 週' + '日一二三四五六'[date.getDay()] + ' · ' + items.length + ' 項';
  const lines = items.length
    ? items.map((event) => {
      const course = courseById(event.course);
      const code = course ? course.code : '自訂';
      const color = course ? course.color : '#2563eb';
      const done = state.done[event.id] ? ' is-done' : '';
      return '<li class="' + done + '"><span class="badge" style="--c:' + color + '">' + esc(code) + '</span><span>' + esc(labelOf(event)) + '</span></li>';
    }).join('')
    : '<li><span class="cal-hint">這天沒有項目</span></li>';
  return '<div class="cal-detail"><p>' + esc(head) + '</p><ul class="cal-list">' + lines + '</ul><div class="cal-actions"><button type="button" data-cal="add">加到這天</button><button type="button" data-cal="clear">看全部</button></div></div>';
}

function weekDetail(events) {
  const week = WEEKS.find((item) => item.id === selectedWeek);
  if (!week) return '';
  const items = events.filter((event) => {
    const found = weekOf(event.date);
    return found && found.id === week.id;
  });
  const head = week.id + ' · ' + shortDate(week.start) + '–' + shortDate(week.end) + ' · ' + items.length + ' 項';
  const lines = items.length
    ? items.map((event) => {
      const course = courseById(event.course);
      const code = course ? course.code : '自訂';
      const color = course ? course.color : '#2563eb';
      const done = state.done[event.id] ? ' is-done' : '';
      return '<li class="' + done + '"><span class="badge" style="--c:' + color + '">' + esc(code) + '</span><span>' + esc(shortDate(event.date)) + ' ' + esc(labelOf(event)) + '</span></li>';
    }).join('')
    : '<li><span class="cal-hint">' + (week.quiet ? '沒有安排' : '這週沒有項目') + '</span></li>';
  return '<div class="cal-detail"><p>' + esc(head) + '</p><ul class="cal-list">' + lines + '</ul><div class="cal-actions"><button type="button" data-cal="clear">看全部</button></div></div>';
}

function onCalendarClick(event) {
  const nav = event.target.closest('[data-cal]');
  if (nav) {
    const action = nav.dataset.cal;
    if (action === 'prev') shiftMonth(-1);
    if (action === 'next') shiftMonth(1);
    if (action === 'clear') {
      selectedDate = '';
      selectedWeek = '';
    }
    if (action === 'today') {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      selectedDate = isoToday();
      selectedWeek = '';
      view = 'upcoming';
      setHash();
    }
    if (action === 'add') {
      openComposer(selectedDate || isoToday());
      return;
    }
    render();
    if (action === 'clear' || action === 'today') focusList();
    return;
  }
  const weekBtn = event.target.closest('[data-week]');
  if (weekBtn) {
    selectedWeek = selectedWeek === weekBtn.dataset.week ? '' : weekBtn.dataset.week;
    selectedDate = '';
    view = 'upcoming';
    setHash();
    render();
    focusList();
    return;
  }
  const day = event.target.closest('[data-date]');
  if (!day) return;
  const iso = day.dataset.date;
  const found = weekOf(iso);
  if (selectedDate === iso) selectedDate = '';
  else {
    selectedDate = iso;
    if (!(selectedWeek && found && found.id === selectedWeek)) selectedWeek = '';
  }
  view = 'upcoming';
  setHash();
  render();
  focusList();
}

function renderList(events) {
  if (!printMode && document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
  const mount = document.getElementById('list');
  if (selectedDate && !printMode) {
    const items = applyFilters(events, 'day');
    mount.innerHTML = items.length ? dayBlock(selectedDate, items) : emptyHTML('這天沒有項目');
    return;
  }
  if (selectedWeek && !printMode) {
    mount.innerHTML = weekListHTML(events);
    return;
  }
  const current = printMode ? 'weeks' : view;
  if (current === 'weeks') mount.innerHTML = weeksHTML(events);
  else if (current === 'courses') mount.innerHTML = coursesHTML(events);
  else mount.innerHTML = upcomingHTML(events);
}

function render() {
  const events = allEvents();
  renderHero(events);
  renderSeason();
  renderRush(events);
  renderChips();
  renderCourseSelect();
  renderRestore();
  paintFilterNote();
  renderStats(events);
  renderList(events);
  renderCalendar(events);
  if (!printMode) syncViewButtons();
}

function jumpToDay(iso) {
  const date = parseISO(iso);
  calYear = date.getFullYear();
  calMonth = date.getMonth();
  selectedDate = iso;
  selectedWeek = '';
  view = 'upcoming';
  setHash();
  render();
  focusList();
}

function setTag(tag) {
  const picked = TAGS.includes(tag) ? tag : '其他';
  document.getElementById('f-kind').value = picked;
  document.querySelectorAll('#tagPick button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.tag === picked));
  });
}

function fillCourseSelect(value) {
  const select = document.getElementById('f-course');
  select.innerHTML = '<option value="">不指定課程</option>' + activeCourses().map((course) => {
    return '<option value="' + esc(course.id) + '">' + esc(courseLabel(course)) + '</option>';
  }).join('');
  if ([...select.options].some((option) => option.value === value)) select.value = value || '';
  else select.value = '';
}

function openComposer(date) {
  editingId = '';
  const dialog = document.getElementById('composer');
  const form = document.getElementById('composerForm');
  form.reset();
  document.getElementById('composerTitle').textContent = '新增事項';
  document.getElementById('composerSubmit').textContent = '加入';
  fillCourseSelect('');
  setTag('其他');
  const picked = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : (selectedDate || isoToday());
  document.getElementById('f-date').value = picked;
  if (!dialog.open) dialog.showModal();
  document.getElementById('f-title').focus();
}

function openEditor(id) {
  const event = allEvents().find((item) => item.id === id);
  if (!event) return;
  editingId = id;
  document.getElementById('composerTitle').textContent = '修改事項';
  document.getElementById('composerSubmit').textContent = '儲存';
  document.getElementById('f-title').value = labelOf(event);
  document.getElementById('f-date').value = event.date;
  fillCourseSelect(event.course || '');
  setTag(tagOf(event.kind));
  const dialog = document.getElementById('composer');
  if (!dialog.open) dialog.showModal();
  document.getElementById('f-title').focus();
}

function closeComposer() {
  editingId = '';
  const dialog = document.getElementById('composer');
  if (dialog.open) dialog.close();
}

function fieldsFrom(form) {
  const title = form.title.value.trim().slice(0, 80);
  const date = form.date.value;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    label: title,
    date,
    kind: tagOf(form.kind.value),
    course: courseById(form.course.value) ? form.course.value : '',
  };
}

function addCustom(form) {
  const fields = fieldsFrom(form);
  if (!fields) return;
  state.custom.push({
    id: 'custom-' + crypto.randomUUID(),
    title: fields.label,
    date: fields.date,
    kind: fields.kind,
    course: fields.course,
  });
  saveState();
  closeComposer();
  view = 'upcoming';
  setHash();
  render();
  document.getElementById('day-' + fields.date)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  toast('已加入');
}

function saveEdit(form) {
  const fields = fieldsFrom(form);
  if (!fields || !editingId) return;
  const id = editingId;
  const custom = state.custom.find((item) => item.id === id);
  if (custom) {
    custom.title = fields.label;
    custom.date = fields.date;
    custom.kind = fields.kind;
    custom.course = fields.course;
  } else if (BASE.some((item) => item.id === id)) {
    state.edits[id] = fields;
  } else {
    return;
  }
  saveState();
  closeComposer();
  render();
  document.getElementById('day-' + fields.date)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  toast('已儲存');
}

function onListClick(event) {
  const editCourse = event.target.closest('[data-edit-course]');
  if (editCourse) {
    openCourseDialog(editCourse.dataset.editCourse);
    return;
  }
  const clear = event.target.closest('#clearBtn');
  if (clear) {
    clearFilters();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  const action = button.dataset.action;

  if (action === 'edit') {
    openEditor(id);
    return;
  }

  if (action === 'toggle') {
    if (state.done[id]) delete state.done[id];
    else state.done[id] = true;
    saveState();
    render();
    document.querySelector('[data-id="' + CSS.escape(id) + '"] .tick input')?.focus();
    return;
  }

  if (action === 'note') {
    if (openNotes.has(id)) openNotes.delete(id);
    else openNotes.add(id);
    render();
    if (openNotes.has(id)) document.getElementById('note-' + id)?.focus();
    return;
  }

  if (action === 'delete') {
    button.dataset.action = 'delete-confirm';
    button.textContent = '再按一次刪除';
    return;
  }

  if (action === 'delete-confirm') {
    if (state.custom.some((item) => item.id === id)) {
      state.custom = state.custom.filter((item) => item.id !== id);
    } else if (BASE.some((item) => item.id === id)) {
      if (!state.hidden.includes(id)) state.hidden.push(id);
      delete state.edits[id];
    } else {
      return;
    }
    delete state.done[id];
    delete state.notes[id];
    openNotes.delete(id);
    saveState();
    render();
    toast('已刪除');
  }
}

function onListInput(event) {
  const box = event.target;
  if (box.tagName !== 'TEXTAREA') return;
  state.notes[box.dataset.id] = box.value;
  if (box.value.trim()) openNotes.add(box.dataset.id);
  saveState();
}

function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    done: state.done,
    notes: state.notes,
    custom: state.custom,
    added: state.added,
    removed: state.removed,
    colors: state.colors,
    profiles: state.profiles,
    edits: state.edits,
    hidden: state.hidden,
    theme: state.theme,
    hideDone: state.hideDone,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'corgihere-schedule.json';
  link.click();
  URL.revokeObjectURL(link.href);
  toast('已下載備份');
}

function importBackup(file) {
  if (!file) return;
  if (file.size > 1000000) {
    toast('檔案太大');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || typeof data !== 'object') throw new Error('bad');
      state.done = data.done && typeof data.done === 'object' ? data.done : {};
      state.notes = data.notes && typeof data.notes === 'object' ? data.notes : {};
      state.removed = sanitizeRemoved(data.removed);
      state.added = sanitizeAdded(data.added);
      state.colors = sanitizeColors(data.colors);
      state.profiles = sanitizeProfiles(data.profiles);
      state.custom = sanitizeCustom(data.custom || [], courseIdSet(state.removed, state.added));
      state.edits = sanitizeEdits(data.edits, courseIdSet(state.removed, state.added));
      state.hidden = sanitizeHidden(data.hidden);
      state.hideDone = !!data.hideDone;
      if (data.theme === 'dark' || data.theme === 'light') state.theme = data.theme;
      saveState();
      document.getElementById('hideDone').checked = state.hideDone;
      applyTheme();
      openNotes.clear();
      Object.keys(state.notes).forEach((id) => { if (state.notes[id]) openNotes.add(id); });
      render();
      toast('已匯入，原本的筆記已覆蓋');
    } catch (err) {
      toast('這個檔案讀不起來');
    }
  };
  reader.readAsText(file);
}

function renderChips() {
  const active = document.activeElement;
  if (active && active.dataset && active.dataset.color) return;
  const chips = document.getElementById('chips');
  const all = '<button type="button" class="chip" data-course="" aria-pressed="' + (!courseFilter) + '">全部</button>';
  const rest = activeCourses().map((course) => {
    const pressed = courseFilter === course.id;
    const name = course.name ? '<span class="chip-name">' + esc(course.name) + '</span>' : '';
    return '<div class="course-row"><label class="swatch"><input type="color" data-color="' + esc(course.id) + '" value="' + esc(course.color) + '" aria-label="' + esc(course.code) + ' 的顏色"></label><button type="button" class="chip" data-course="' + esc(course.id) + '" style="--c:' + course.color + '" aria-pressed="' + pressed + '" title="' + esc(courseLabel(course)) + '"><span class="badge">' + esc(course.code) + '</span>' + name + '</button><button type="button" class="icon-btn" data-edit-course="' + esc(course.id) + '" aria-label="修改 ' + esc(course.code) + '" title="修改">' + NOTE_ICON + '</button><button type="button" class="icon-btn" data-remove-course="' + esc(course.id) + '" aria-label="刪除 ' + esc(course.code) + '" title="刪除">×</button></div>';
  }).join('');
  chips.innerHTML = all + rest;
}

function renderCourseSelect() {
  const dialog = document.getElementById('composer');
  if (dialog.open) return;
  const select = document.getElementById('f-course');
  const current = select.value;
  select.innerHTML = '<option value="">不指定課程</option>' + activeCourses().map((course) => {
    return '<option value="' + esc(course.id) + '">' + esc(courseLabel(course)) + '</option>';
  }).join('');
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renderRestore() {
  const mount = document.getElementById('courseRestore');
  if (!state.removed.length) {
    mount.innerHTML = '';
    return;
  }
  mount.innerHTML = state.removed.map((id) => {
    const course = COURSES.find((item) => item.id === id);
    if (!course) return '';
    return '<button type="button" class="mini" data-restore="' + course.id + '">還原 ' + esc(course.code) + '</button>';
  }).join('');
}

function deleteCourse(id) {
  const course = courseById(id);
  if (!course) return;
  if (COURSES.some((item) => item.id === id)) {
    if (!state.removed.includes(id)) state.removed.push(id);
  } else {
    state.added = state.added.filter((item) => item.id !== id);
    delete state.colors[id];
    state.custom.forEach((item) => {
      if (item.course === id) item.course = '';
    });
  }
  if (courseFilter === id) courseFilter = '';
  saveState();
  render();
  toast('已刪除 ' + course.code);
}

function addCourse(form) {
  const code = form.code.value.trim().slice(0, 12);
  const name = form.name && typeof form.name.value === 'string' ? form.name.value.trim().slice(0, 80) : '';
  if (!code) return;
  if (activeCourses().some((course) => course.code.toLowerCase() === code.toLowerCase())) {
    toast('已有這個代號');
    return;
  }
  const color = validColor(form.color.value) || '#2563eb';
  state.added.push({ id: 'course-' + crypto.randomUUID(), code, name, color });
  saveState();
  form.code.value = '';
  if (form.name) form.name.value = '';
  render();
  toast('已新增 ' + code);
}

function openCourseDialog(id) {
  const course = id ? courseById(id) : null;
  document.getElementById('courseDialogTitle').textContent = course ? '修改課程' : '新增課程';
  document.getElementById('c-id').value = course ? course.id : '';
  document.getElementById('c-code').value = course ? course.code : '';
  document.getElementById('c-name').value = course ? (course.name || '') : '';
  document.getElementById('c-color').value = course ? course.color : '#2563eb';
  const dialog = document.getElementById('courseDialog');
  if (!dialog.open) dialog.showModal();
  document.getElementById('c-code').focus();
}

function closeCourseDialog() {
  const dialog = document.getElementById('courseDialog');
  if (dialog.open) dialog.close();
}

function saveCourse() {
  const id = document.getElementById('c-id').value;
  const code = document.getElementById('c-code').value.trim().slice(0, 12);
  const name = document.getElementById('c-name').value.trim().slice(0, 80);
  const color = validColor(document.getElementById('c-color').value) || '#2563eb';
  if (!code) return;
  if (activeCourses().some((course) => course.id !== id && course.code.toLowerCase() === code.toLowerCase())) {
    toast('已有這個代號');
    return;
  }
  if (!id) {
    state.added.push({ id: 'course-' + crypto.randomUUID(), code, name, color });
  } else if (COURSES.some((course) => course.id === id)) {
    state.profiles[id] = { code, name };
    state.colors[id] = color;
  } else {
    const course = state.added.find((item) => item.id === id);
    if (!course) return;
    course.code = code;
    course.name = name;
    course.color = color;
    state.colors[id] = color;
  }
  saveState();
  closeCourseDialog();
  render();
  toast(id ? '已儲存' : '已新增 ' + code);
}

function initWhere() {
  const where = document.getElementById('where');
  if (location.protocol.startsWith('http')) where.textContent = '現在開的是 ' + location.origin;
  else where.textContent = '這是直接開啟的檔案。';
}

function init() {
  const hash = location.hash.slice(1);
  view = hash === 'courses' ? 'courses' : 'upcoming';
  applyTheme();
  document.getElementById('hideDone').checked = state.hideDone;
  initWhere();
  setHash();
  render();

  document.querySelectorAll('.view-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setView(button.dataset.view);
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });
  });
  document.getElementById('themeBtn').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    state.theme = current === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
  });
  document.getElementById('chips').addEventListener('click', (event) => {
    const editCourse = event.target.closest('[data-edit-course]');
    if (editCourse) {
      openCourseDialog(editCourse.dataset.editCourse);
      return;
    }
    const remove = event.target.closest('[data-remove-course]');
    if (remove) {
      if (remove.dataset.confirm !== '1') {
        remove.dataset.confirm = '1';
        remove.classList.add('is-danger');
        remove.textContent = '再按';
        remove.setAttribute('aria-label', '再按一次刪除');
        return;
      }
      deleteCourse(remove.dataset.removeCourse);
      return;
    }
    const button = event.target.closest('.chip');
    if (!button) return;
    courseFilter = button.dataset.course || '';
    syncChips();
    render();
  });
  document.getElementById('chips').addEventListener('change', (event) => {
    const input = event.target.closest('[data-color]');
    if (!input) return;
    const color = validColor(input.value);
    if (!color) return;
    input.blur();
    state.colors[input.dataset.color] = color;
    saveState();
    render();
  });
  document.getElementById('courseAdd').addEventListener('submit', (event) => {
    event.preventDefault();
    addCourse(event.currentTarget);
  });
  document.getElementById('courseRestore').addEventListener('click', (event) => {
    const button = event.target.closest('[data-restore]');
    if (!button) return;
    state.removed = state.removed.filter((id) => id !== button.dataset.restore);
    saveState();
    render();
    toast('已還原');
  });
  document.getElementById('addBtn').addEventListener('click', () => openComposer());
  document.getElementById('calendar').addEventListener('click', onCalendarClick);
  document.getElementById('closeComposer').addEventListener('click', closeComposer);
  document.getElementById('cancelComposer').addEventListener('click', closeComposer);
  document.getElementById('tagPick').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (button) setTag(button.dataset.tag);
  });
  document.getElementById('composerForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (editingId) saveEdit(event.currentTarget);
    else addCustom(event.currentTarget);
  });
  document.getElementById('closeCourse').addEventListener('click', closeCourseDialog);
  document.getElementById('cancelCourse').addEventListener('click', closeCourseDialog);
  document.getElementById('courseForm').addEventListener('submit', (event) => {
    event.preventDefault();
    saveCourse();
  });
  document.getElementById('q').addEventListener('input', (event) => {
    query = event.target.value;
    render();
  });
  document.getElementById('hideDone').addEventListener('change', (event) => {
    state.hideDone = event.target.checked;
    saveState();
    render();
  });
  document.getElementById('clearBtn').addEventListener('click', clearFilters);
  document.getElementById('list').addEventListener('click', onListClick);
  document.getElementById('list').addEventListener('input', onListInput);
  document.getElementById('rush').addEventListener('click', (event) => {
    const button = event.target.closest('[data-jump]');
    if (button) jumpToDay(button.dataset.jump);
  });
  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (event) => {
    importBackup(event.target.files[0]);
    event.target.value = '';
  });
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => { printMode = true; render(); });
  window.addEventListener('afterprint', () => { printMode = false; render(); });
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (next === 'weeks') {
      view = 'upcoming';
      setHash();
      return;
    }
    if ((next === 'courses' || next === 'upcoming') && next !== view) {
      view = next;
      if (next !== 'upcoming') {
        selectedDate = '';
        selectedWeek = '';
      }
      render();
    }
  });
  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
    if (event.key === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
      event.preventDefault();
      openComposer();
    }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!state.theme) applyTheme();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    render();
    pullAndMerge();
  });
  setInterval(() => render(), 60000);
  setInterval(() => { if (!document.hidden) pullAndMerge(); }, 20000);
  pullAndMerge();
}

init();
