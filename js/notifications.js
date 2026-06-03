// notifications.js — local reminders (FR-3, FR-4, FR-6, FR-7; NFR-4).
//
// PWA reality check: there is no cross-platform way to guarantee a notification
// fires while the app is fully closed (iOS especially restricts this). So we use
// a layered, honest strategy:
//   1. Notification Triggers (TimestampTrigger) for best-effort BACKGROUND
//      delivery where supported (Chrome/Edge/Android).
//   2. Foreground timers (setTimeout) while the app is open.
//   3. "Surface on open" — if a nudge is overdue when you open the app, it shows
//      immediately. A habit app gets opened ~daily, so nothing slips past a week.
// The schedule is rebuilt on every open / check-in / settings change, which keeps
// triggers consistent with state (checked-in days never get a morning nudge).

import { dayKey, addDays, fromKey } from './dates.js';
import { isCheckedIn } from './storage.js';
import { needsSafeguard } from './streak.js';

const TAG_PREFIX = 'anchor:';
let foregroundTimers = [];
let shownThisSession = new Set();

export function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission() {
  return isSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function hasTriggers() {
  return typeof window !== 'undefined' && 'TimestampTrigger' in window;
}

async function registration() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

// --- Copy -----------------------------------------------------------------

function morningPayload(d, when) {
  return {
    tag: `${TAG_PREFIX}morning:${d}`,
    when,
    title: 'Anchor',
    body: 'Morning — one lesson keeps the chain alive.',
    urgent: false,
  };
}

function safeguardPayload(d, when) {
  return {
    tag: `${TAG_PREFIX}day2:${d}`,
    when,
    title: "⚠️ Don't break the chain",
    body: "You missed yesterday. Don't miss today — this is the one that counts.",
    urgent: true,
  };
}

function eveningPayload(d, when) {
  return {
    tag: `${TAG_PREFIX}evening:${d}`,
    when,
    title: 'Anchor',
    body: "Haven't checked in yet — a few minutes keeps your streak alive.",
    urgent: false,
  };
}

function weeklyPayload(when) {
  return {
    tag: `${TAG_PREFIX}weekly:${dayKey(when)}`,
    when,
    title: 'Weekly review',
    body: 'Take 60 seconds to look back at your week.',
    urgent: false,
  };
}

function wakePayload(item, when) {
  return {
    tag: `${TAG_PREFIX}wake:${item.id}`,
    when,
    title: item.title,
    body: 'Time to pick this back up.',
    urgent: false,
  };
}

// --- Planning (pure) ------------------------------------------------------

function timeOn(dateKey, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = fromKey(dateKey);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextWeekly(reminders, now) {
  // Next occurrence of weeklyDay (0=Sun) at weeklyTime, strictly after now.
  for (let i = 0; i < 8; i++) {
    const cand = timeOn(dayKey(new Date(now.getTime() + i * 86400000)), reminders.weeklyTime);
    if (cand.getDay() === reminders.weeklyDay && cand > now) return cand;
  }
  return null;
}

/**
 * The set of notifications that *should* exist looking forward from `now`.
 * Pure: takes state + now, returns payloads. Exported for testing.
 */
export function planned(state, now = new Date()) {
  const r = state.reminders;
  const plan = [];
  if (!r.enabled) return plan;

  const today = dayKey(now);

  for (const offset of [0, 1]) {
    const d = addDays(today, offset);
    if (offset === 0 && isCheckedIn(state, d)) continue; // FR-3: none if done

    const morn = timeOn(d, r.morningTime);
    if (morn > now) {
      // FR-4: only assert the safeguard for today (tomorrow's depends on
      // whether today ends missed, which we can't know yet).
      const safeguard = offset === 0 && needsSafeguard(state.checkIns, today);
      plan.push(safeguard ? safeguardPayload(d, morn) : morningPayload(d, morn));
    }

    if (r.eveningEnabled) {
      const eve = timeOn(d, r.eveningTime);
      if (eve > now) plan.push(eveningPayload(d, eve));
    }
  }

  if (r.weeklyEnabled) {
    const w = nextWeekly(r, now);
    if (w) plan.push(weeklyPayload(w));
  }

  for (const item of state.parked) {
    if (item.wakeUpDate && !item.wokenAt) {
      const wt = timeOn(item.wakeUpDate, '09:00');
      if (wt > now) plan.push(wakePayload(item, wt));
    }
  }

  return plan;
}

// --- Delivery -------------------------------------------------------------

function notifyOptions(p) {
  return {
    tag: p.tag,
    body: p.body,
    requireInteraction: p.urgent,
    silent: false,
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    data: { urgent: p.urgent, tag: p.tag },
    actions: [
      { action: 'checkin', title: 'Check in' },
      { action: 'snooze', title: 'Snooze 1h' },
    ],
  };
}

/** Show a notification immediately. */
export async function notifyNow(p) {
  if (permission() !== 'granted') return;
  const reg = await registration();
  if (reg) {
    await reg.showNotification(p.title, notifyOptions(p));
  } else if (isSupported()) {
    // eslint-disable-next-line no-new
    new Notification(p.title, { body: p.body, icon: 'icons/icon.svg', tag: p.tag });
  }
}

async function clearScheduled(reg) {
  if (!reg || !reg.getNotifications) return;
  try {
    const list = await reg.getNotifications({ includeTriggered: true });
    for (const n of list) {
      if (typeof n.tag === 'string' && n.tag.startsWith(TAG_PREFIX)) n.close();
    }
  } catch {
    /* not all browsers support includeTriggered */
  }
}

function clearForegroundTimers() {
  for (const id of foregroundTimers) clearTimeout(id);
  foregroundTimers = [];
}

/**
 * Rebuild the entire schedule from current state. Safe to call often.
 */
export async function rebuild(state, now = new Date()) {
  if (permission() !== 'granted') return;
  const plan = planned(state, now);
  const reg = await registration();

  // Background (best-effort) via Notification Triggers.
  if (reg && hasTriggers()) {
    await clearScheduled(reg);
    for (const p of plan) {
      try {
        await reg.showNotification(p.title, {
          ...notifyOptions(p),
          showTrigger: new window.TimestampTrigger(p.when.getTime()),
        });
      } catch (e) {
        console.warn('Anchor: trigger scheduling failed for', p.tag, e);
      }
    }
  }

  // Foreground timers (fire while the app stays open even without triggers).
  clearForegroundTimers();
  for (const p of plan) {
    const delay = p.when.getTime() - now.getTime();
    if (delay > 0 && delay < 2 ** 31 - 1) {
      const id = setTimeout(() => {
        if (!shownThisSession.has(p.tag)) {
          shownThisSession.add(p.tag);
          notifyNow(p);
        }
      }, delay);
      foregroundTimers.push(id);
    }
  }
}

/**
 * If a reminder is currently overdue and unsatisfied, surface it now.
 * Called on load and when the tab becomes visible — the safety net that makes
 * "a quiet week can't slip past" true even if background delivery failed.
 */
export async function surfaceOverdue(state, now = new Date()) {
  if (permission() !== 'granted') return;
  const today = dayKey(now);
  if (isCheckedIn(state, today)) return;

  const r = state.reminders;
  if (!r.enabled) return;

  const morn = timeOn(today, r.morningTime);
  const safeguard = needsSafeguard(state.checkIns, today);
  const tag = safeguard ? `${TAG_PREFIX}day2:${today}` : `${TAG_PREFIX}morning:${today}`;

  if (now >= morn && !shownThisSession.has(tag)) {
    shownThisSession.add(tag);
    await notifyNow(safeguard ? safeguardPayload(today, morn) : morningPayload(today, morn));
  }
}

/** Reset the per-session dedupe (e.g. at midnight rollover). */
export function resetSession() {
  shownThisSession = new Set();
}
