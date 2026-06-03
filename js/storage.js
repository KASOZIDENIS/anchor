// storage.js — offline-first local persistence (NFR-2, NFR-3).
//
// Everything lives in one JSON blob in localStorage. No account, no cloud,
// no network. Small enough that localStorage is the right tool — IndexedDB
// would be over-engineering (P6).

import { dayKey } from './dates.js';

const KEY = 'anchor.state.v1';

/** Default state for a brand-new install. */
export function defaultState() {
  return {
    version: 1,
    habit: {
      name: 'Daily learning',
      minimumRule: '1 lesson / 20 min — whichever is smaller',
      createdAt: new Date().toISOString(),
    },
    // checkIns: { 'YYYY-MM-DD': { at: ISO string, note: string | null } }
    checkIns: {},
    reminders: {
      enabled: false,           // becomes true once notifications are granted
      morningTime: '07:30',     // the morning anchor
      eveningEnabled: true,     // gentle evening fallback
      eveningTime: '20:30',
      weeklyEnabled: true,      // FR-6 weekly review nudge
      weeklyDay: 0,             // 0 = Sunday
      weeklyTime: '10:00',
      snoozeAllowed: true,      // one snooze max
      snoozeMinutes: 60,
    },
    // FR-7 parked & seasonal items
    parked: [],
    meta: {
      onboarded: false,
      snooze: null,             // { date: key, until: ISO } — one snooze/day
      lastWeeklyReview: null,   // last week-start key the review was opened
    },
  };
}

/** Deep-merge loaded state over defaults so new fields appear after upgrades. */
function withDefaults(loaded) {
  const d = defaultState();
  if (!loaded || typeof loaded !== 'object') return d;
  return {
    ...d,
    ...loaded,
    habit: { ...d.habit, ...(loaded.habit || {}) },
    reminders: { ...d.reminders, ...(loaded.reminders || {}) },
    checkIns: { ...(loaded.checkIns || {}) },
    parked: Array.isArray(loaded.parked) ? loaded.parked : [],
    meta: { ...d.meta, ...(loaded.meta || {}) },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return withDefaults(raw ? JSON.parse(raw) : null);
  } catch (e) {
    console.warn('Anchor: failed to load state, starting fresh.', e);
    return defaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Anchor: failed to save state.', e);
  }
}

// --- High-level mutations -------------------------------------------------

/** FR-1: idempotent check-in for `dateKey` (defaults to today). */
export function checkIn(state, dateKey = dayKey(), note = null) {
  const existing = state.checkIns[dateKey];
  if (existing) {
    // Idempotent (TC-004): don't overwrite the timestamp; only let a later
    // note edit through.
    if (note != null) existing.note = note;
    return state;
  }
  state.checkIns[dateKey] = { at: new Date().toISOString(), note: note ?? null };
  return state;
}

export function isCheckedIn(state, dateKey = dayKey()) {
  return Boolean(state.checkIns[dateKey]);
}

export function setNote(state, dateKey, note) {
  if (state.checkIns[dateKey]) state.checkIns[dateKey].note = note || null;
  return state;
}

// --- Parked items (FR-7) --------------------------------------------------

export function addParked(state, { title, type = 'someday', wakeUpDate = null }) {
  state.parked.push({
    id: cryptoId(),
    title: title.trim(),
    type,
    wakeUpDate: wakeUpDate || null,
    createdAt: new Date().toISOString(),
    wokenAt: null, // set once its wake-up has surfaced, so it fires only once
  });
  return state;
}

export function removeParked(state, id) {
  state.parked = state.parked.filter((p) => p.id !== id);
  return state;
}

// --- Backup (NFR-6) -------------------------------------------------------

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  return withDefaults(parsed);
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
