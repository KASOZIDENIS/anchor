// app.js — UI, navigation, and glue. Renders a tiny single-page app into #app.
//
// Design follows the principles: home screen = today's status + streak + one
// check-in button, nothing competing (NFR-5, P1). Everything else lives behind
// a quiet bottom nav.

import {
  load, save, checkIn, isCheckedIn, setNote,
  addParked, removeParked, exportJSON, importJSON,
} from './storage.js';
import { computeStreak, needsSafeguard, todayStatus, chain } from './streak.js';
import {
  dayKey, addDays, startOfWeek, shortLabel, longLabel, fromKey, dayDiff,
} from './dates.js';
import * as notify from './notifications.js';

let state = load();
let view = 'home';

const el = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

// --- Persistence + reschedule on every mutation ---------------------------

function commit() {
  save(state);
  notify.rebuild(state).catch(() => {});
  render();
}

// --- Check-in (FR-1) ------------------------------------------------------

function doCheckIn() {
  const today = dayKey();
  if (isCheckedIn(state, today)) return; // idempotent (TC-004)
  checkIn(state, today);
  commit();
}

// --- Views ----------------------------------------------------------------

function viewHome() {
  const today = dayKey();
  const { current, longest } = computeStreak(state.checkIns, today);
  const done = isCheckedIn(state, today);
  const safeguard = needsSafeguard(state.checkIns, today);

  const wrap = h('section', { class: 'home' });

  // Day-2 safeguard banner — the differentiator, loud and distinct (FR-4).
  if (safeguard) {
    wrap.append(h('div', { class: 'banner banner-alert' },
      h('strong', {}, 'You missed yesterday.'),
      ' Don’t miss today — this is the one that counts.'));
  }

  // Streak headline (most prominent element — FR-2).
  wrap.append(h('div', { class: 'streak' },
    h('div', { class: 'streak-num' }, String(current)),
    h('div', { class: 'streak-label' }, current === 1 ? 'day streak' : 'day streak')));

  // Check-in button / done state (FR-1).
  if (done) {
    wrap.append(h('button', { class: 'checkin done', disabled: true }, 'Done for today ✓'));
  } else {
    wrap.append(h('button', { class: `checkin ${safeguard ? 'urgent' : ''}`, onclick: doCheckIn },
      'Check In'));
    wrap.append(h('p', { class: 'min-rule' }, state.habit.minimumRule));
  }

  // Build-and-apply note (FR-5) — optional, appears after check-in, never blocks.
  if (done) wrap.append(buildNoteField(today));

  // The chain grid (FR-2).
  wrap.append(chainGrid());

  // Longest streak — secondary.
  wrap.append(h('div', { class: 'secondary' },
    h('span', {}, `Longest: ${longest} ${longest === 1 ? 'day' : 'days'}`),
    h('span', { class: 'sep' }, '·'),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); go('review'); } }, 'Weekly review')));

  return wrap;
}

function buildNoteField(dateKey) {
  const note = state.checkIns[dateKey]?.note || '';
  const input = h('input', {
    class: 'note-input',
    type: 'text',
    maxlength: '140',
    placeholder: 'What did you build / where will you use it? (optional)',
    value: note,
  });
  const saveNote = () => { setNote(state, dateKey, input.value); save(state); };
  input.addEventListener('blur', saveNote);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return h('div', { class: 'note-wrap' }, input);
}

function chainGrid() {
  const today = dayKey();
  const start = addDays(startOfWeek(today), -4 * 7); // last 5 weeks
  const end = addDays(startOfWeek(today), 6);
  const cells = chain(start, end, state.checkIns, today);

  const grid = h('div', { class: 'chain' });
  // Weekday header (Mon..Sun)
  for (const wd of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    grid.append(h('div', { class: 'chain-head' }, wd));
  }
  for (const c of cells) {
    const isToday = c.date === today;
    grid.append(h('div', {
      class: `cell ${c.color}${isToday ? ' today' : ''}`,
      title: `${longLabel(c.date)} — ${c.status}`,
    }));
  }
  return h('div', { class: 'chain-wrap' }, grid, legend());
}

function legend() {
  const item = (cls, label) => h('span', { class: 'leg' }, h('i', { class: `dot ${cls}` }), label);
  return h('div', { class: 'legend' },
    item('green', 'done'), item('amber', 'miss (ok)'), item('red', 'break'));
}

// --- Build log (FR-5) -----------------------------------------------------

function viewLog() {
  const entries = Object.entries(state.checkIns)
    .filter(([, v]) => v.note)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const wrap = h('section', { class: 'page' }, h('h2', {}, 'Build log'));
  if (entries.length === 0) {
    wrap.append(h('p', { class: 'empty' },
      'Nothing yet. After you check in, jot what you built — applied learning doesn’t get boring.'));
  } else {
    const list = h('ul', { class: 'log-list' });
    for (const [date, v] of entries) {
      list.append(h('li', {},
        h('div', { class: 'log-date' }, longLabel(date)),
        h('div', { class: 'log-note' }, v.note)));
    }
    wrap.append(list);
  }
  return wrap;
}

// --- Weekly review (FR-6) -------------------------------------------------

function viewReview() {
  const today = dayKey();
  state.meta.lastWeeklyReview = startOfWeek(today);
  save(state);

  const ws = startOfWeek(today);
  const we = addDays(ws, 6);
  const week = chain(ws, we, state.checkIns, today);
  const doneCount = week.filter((c) => c.status === 'done').length;
  const { current } = computeStreak(state.checkIns, today);

  const wrap = h('section', { class: 'page' }, h('h2', {}, 'This week'));
  wrap.append(h('div', { class: 'review-stats' },
    stat(String(doneCount), 'days done'),
    stat(String(current), 'day streak')));

  const row = h('div', { class: 'week-row' });
  for (const c of week) {
    row.append(h('div', { class: 'week-day' },
      h('div', { class: `cell ${c.color}${c.date === today ? ' today' : ''}` }),
      h('small', {}, shortLabel(c.date).split(' ')[0])));
  }
  wrap.append(row);

  const notes = week.filter((c) => state.checkIns[c.date]?.note);
  if (notes.length) {
    wrap.append(h('h3', {}, 'What you built'));
    const list = h('ul', { class: 'log-list' });
    for (const c of notes) {
      list.append(h('li', {},
        h('div', { class: 'log-date' }, shortLabel(c.date)),
        h('div', { class: 'log-note' }, state.checkIns[c.date].note)));
    }
    wrap.append(list);
  }
  return wrap;
}

function stat(num, label) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, num), h('div', { class: 'stat-label' }, label));
}

// --- Parked & seasonal items (FR-7) ---------------------------------------

function viewParked() {
  const today = dayKey();
  const wrap = h('section', { class: 'page' }, h('h2', {}, 'Parked'),
    h('p', { class: 'subtle' }, 'Things you’ve deliberately put down. They stay silent until they’re relevant — no daily nagging.'));

  // Add form
  const title = h('input', { type: 'text', placeholder: 'e.g. WLF partnerships', class: 'fill' });
  const type = h('select', {}, h('option', { value: 'someday' }, 'Someday (no date)'), h('option', { value: 'seasonal' }, 'Seasonal (wake-up date)'));
  const date = h('input', { type: 'date', class: 'fill hidden' });
  type.addEventListener('change', () => date.classList.toggle('hidden', type.value !== 'seasonal'));
  const add = h('button', { class: 'btn', onclick: () => {
    if (!title.value.trim()) return;
    addParked(state, { title: title.value, type: type.value, wakeUpDate: type.value === 'seasonal' ? (date.value || null) : null });
    commit();
  } }, 'Park it');
  wrap.append(h('div', { class: 'park-form' }, title, h('div', { class: 'row' }, type, date), add));

  if (state.parked.length === 0) {
    wrap.append(h('p', { class: 'empty' }, 'Nothing parked.'));
    return wrap;
  }

  const list = h('ul', { class: 'park-list' });
  for (const item of [...state.parked].sort((a, b) => (a.wakeUpDate || '9999') < (b.wakeUpDate || '9999') ? -1 : 1)) {
    const due = item.wakeUpDate && dayDiff(item.wakeUpDate, today) <= 0;
    const meta = item.wakeUpDate
      ? (due ? 'now — time to start' : `wakes ${longLabel(item.wakeUpDate)}`)
      : 'someday';
    list.append(h('li', { class: due ? 'due' : '' },
      h('div', {},
        h('div', { class: 'park-title' }, item.title),
        h('div', { class: 'park-meta' }, meta)),
      h('button', { class: 'x', title: 'Remove', onclick: () => { removeParked(state, item.id); commit(); } }, '✕')));
  }
  wrap.append(list);
  return wrap;
}

// --- Settings -------------------------------------------------------------

function viewSettings() {
  const r = state.reminders;
  const wrap = h('section', { class: 'page' }, h('h2', {}, 'Settings'));

  // Notifications
  const perm = notify.permission();
  const notifBox = h('div', { class: 'card' }, h('h3', {}, 'Reminders'));
  if (perm === 'granted' && r.enabled) {
    notifBox.append(h('p', { class: 'ok' }, '✓ Notifications enabled'));
  } else {
    notifBox.append(h('p', { class: 'subtle' }, perm === 'denied'
      ? 'Notifications are blocked in your browser settings — enable them there, then reload.'
      : 'Turn on a gentle morning nudge.'));
    notifBox.append(h('button', { class: 'btn', onclick: enableReminders }, 'Enable reminders'));
  }

  notifBox.append(timeRow('Morning anchor', r.morningTime, (v) => { r.morningTime = v; commit(); }));
  notifBox.append(h('p', { class: 'hint' }, 'Set this to match something you already do every morning — coffee, sitting at your desk.'));
  notifBox.append(toggleRow('Evening fallback', r.eveningEnabled, (v) => { r.eveningEnabled = v; commit(); }));
  if (r.eveningEnabled) notifBox.append(timeRow('Evening time', r.eveningTime, (v) => { r.eveningTime = v; commit(); }));
  notifBox.append(toggleRow('Weekly review nudge', r.weeklyEnabled, (v) => { r.weeklyEnabled = v; commit(); }));
  notifBox.append(toggleRow('Allow one snooze', r.snoozeAllowed, (v) => { r.snoozeAllowed = v; commit(); }));
  wrap.append(notifBox);

  // Habit
  const habitBox = h('div', { class: 'card' }, h('h3', {}, 'Habit'));
  const name = h('input', { type: 'text', class: 'fill', value: state.habit.name });
  name.addEventListener('blur', () => { state.habit.name = name.value.trim() || 'Daily learning'; save(state); });
  habitBox.append(h('label', {}, 'Name', name));
  wrap.append(habitBox);

  // Backup (NFR-6)
  const backup = h('div', { class: 'card' }, h('h3', {}, 'Backup'),
    h('p', { class: 'subtle' }, 'Your data lives only on this device. Export a copy so a phone reset never wipes your streak.'));
  backup.append(h('div', { class: 'row' },
    h('button', { class: 'btn', onclick: doExport }, 'Export'),
    h('button', { class: 'btn', onclick: () => el('import-file').click() }, 'Import')));
  backup.append(h('input', { id: 'import-file', type: 'file', accept: 'application/json', class: 'hidden', onchange: doImport }));
  wrap.append(backup);

  wrap.append(h('p', { class: 'version' }, 'Anchor v1 · offline · private'));
  return wrap;
}

function timeRow(label, value, onChange) {
  const input = h('input', { type: 'time', value });
  input.addEventListener('change', () => onChange(input.value));
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

function toggleRow(label, checked, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'field toggle' }, h('span', {}, label), input);
}

async function enableReminders() {
  const result = await notify.requestPermission();
  if (result === 'granted') {
    state.reminders.enabled = true;
    commit();
  } else {
    render();
  }
}

function doExport() {
  const blob = new Blob([exportJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `anchor-backup-${dayKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function doImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importJSON(reader.result);
      commit();
    } catch {
      alert('That file could not be read as an Anchor backup.');
    }
  };
  reader.readAsText(file);
}

// --- Onboarding -----------------------------------------------------------

function viewOnboarding() {
  const wrap = h('section', { class: 'onboarding' },
    h('h1', {}, 'Anchor'),
    h('p', { class: 'lead' }, 'One small thing every morning. Miss once, it’s fine — miss twice, the app shouts.'));

  const name = h('input', { type: 'text', class: 'fill', value: state.habit.name });
  const time = h('input', { type: 'time', value: state.reminders.morningTime });

  wrap.append(
    h('label', { class: 'field' }, h('span', {}, 'What are you building the habit of?'), name),
    h('label', { class: 'field' }, h('span', {}, 'Morning reminder'), time),
    h('p', { class: 'hint' }, 'Set this to match something you already do every morning — your coffee, sitting at your desk. Let the ritual remind you.'),
    h('button', { class: 'btn primary', onclick: async () => {
      state.habit.name = name.value.trim() || 'Daily learning';
      state.reminders.morningTime = time.value;
      state.meta.onboarded = true;
      const perm = await notify.requestPermission();
      if (perm === 'granted') state.reminders.enabled = true;
      commit();
    } }, 'Start'),
    h('p', { class: 'hint center' }, 'No account. No cloud. Your data stays on this device.'));
  return wrap;
}

// --- Shell + nav ----------------------------------------------------------

function navItem(id, label, icon) {
  return h('button', {
    class: `nav-item ${view === id ? 'active' : ''}`,
    onclick: () => go(id),
  }, h('span', { class: 'nav-icon' }, icon), h('span', {}, label));
}

function go(v) { view = v; render(); window.scrollTo(0, 0); }

function render() {
  const root = el('app');
  root.innerHTML = '';

  if (!state.meta.onboarded) {
    root.append(viewOnboarding());
    return;
  }

  const views = {
    home: viewHome, log: viewLog, review: viewReview, parked: viewParked, settings: viewSettings,
  };
  root.append(h('main', { class: 'view' }, (views[view] || viewHome)()));
  root.append(h('nav', { class: 'nav' },
    navItem('home', 'Today', '⚓'),
    navItem('log', 'Log', '✎'),
    navItem('parked', 'Parked', '⏸'),
    navItem('settings', 'Settings', '⚙')));
}

// --- Lifecycle ------------------------------------------------------------

// Surface any parked wake-ups that have come due (FR-7) — fire once each.
function surfaceWakeUps() {
  const today = dayKey();
  let changed = false;
  for (const item of state.parked) {
    if (item.wakeUpDate && !item.wokenAt && dayDiff(item.wakeUpDate, today) <= 0) {
      item.wokenAt = today;
      changed = true;
      notify.notifyNow({
        tag: `anchor:wake:${item.id}`,
        title: item.title,
        body: 'Time to pick this back up.',
        urgent: false,
      }).catch(() => {});
    }
  }
  if (changed) save(state);
}

let rolloverTimer = null;
function scheduleMidnightRollover() {
  if (rolloverTimer) clearTimeout(rolloverTimer);
  const now = new Date();
  const next = fromKey(addDays(dayKey(now), 1));
  rolloverTimer = setTimeout(() => {
    notify.resetSession();
    surfaceWakeUps();
    notify.rebuild(state).catch(() => {});
    render();
    scheduleMidnightRollover();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

async function init() {
  // Register the service worker for offline + background notifications.
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch { /* insecure context — app still works */ }
  }

  render();
  surfaceWakeUps();
  await notify.rebuild(state);
  await notify.surfaceOverdue(state);
  scheduleMidnightRollover();

  // Re-evaluate whenever the app comes back to the foreground.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      state = load(); // pick up anything changed elsewhere
      render();
      surfaceWakeUps();
      await notify.rebuild(state);
      await notify.surfaceOverdue(state);
    }
  });

  // Let the service worker tell us to check in (notification action / click).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'checkin') { doCheckIn(); }
      if (e.data?.type === 'navigate') { go(e.data.view || 'home'); }
    });
  }
}

init();
