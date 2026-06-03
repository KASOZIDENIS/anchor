// streak.js — THE HEART OF ANCHOR (§4.1).
//
// The forgiving "don't break the chain" rule, defined precisely:
//   - A day is `done` if it has a check-in, else `missed` once it has ended.
//   - Today, if not yet checked in, is `pending` (the day hasn't ended — not a miss).
//   - A SINGLE isolated missed day does NOT break the streak (shown amber).
//   - The streak breaks (resets to 0) ONLY on two consecutive missed days.
//     The second consecutive miss is the break, shown red.
//   - longest = the best forgiving streak ever achieved.
//
// Pure functions only — no DOM, no storage. This is the module the QA test
// suite (Appendix A) exercises directly.

import { dayKey, addDays, dayDiff, rangeKeys } from './dates.js';

/** Normalize check-ins (Set | array | object map) to a Set of day keys. */
function toSet(checkIns) {
  if (checkIns instanceof Set) return checkIns;
  if (Array.isArray(checkIns)) return new Set(checkIns);
  return new Set(Object.keys(checkIns || {}));
}

/**
 * Status of a single day relative to `today`.
 * @returns {'done'|'pending'|'missed'|'future'}
 */
export function statusOf(key, checkIns, today = dayKey()) {
  const set = toSet(checkIns);
  if (set.has(key)) return 'done';
  const diff = dayDiff(key, today);
  if (diff > 0) return 'future';
  if (diff === 0) return 'pending';
  return 'missed';
}

/**
 * Display color for a day (FR-2):
 *   green = done, amber = single recoverable miss,
 *   red = break (second consecutive miss), grey = pending/future.
 * A miss is RED when the immediately preceding calendar day was also missed,
 * otherwise AMBER (still recoverable).
 */
export function colorOf(key, checkIns, today = dayKey()) {
  const status = statusOf(key, checkIns, today);
  if (status === 'done') return 'green';
  if (status === 'missed') {
    const prev = statusOf(addDays(key, -1), checkIns, today);
    return prev === 'missed' ? 'red' : 'amber';
  }
  return 'grey'; // pending or future
}

/**
 * Compute the current streak, longest streak, and last break date from the
 * full check-in history, evaluated as of `today`.
 *
 * @returns {{current:number, longest:number, lastBreakDate:string|null}}
 */
export function computeStreak(checkIns, today = dayKey()) {
  const set = toSet(checkIns);
  if (set.size === 0) return { current: 0, longest: 0, lastBreakDate: null };

  const keys = [...set].sort();
  const first = keys[0];
  // Evaluate every calendar day from the first check-in up to today.
  const days = rangeKeys(first, today);

  let run = 0;          // done-days in the current forgiving run
  let longest = 0;
  let lastBreakDate = null;
  let prev = null;      // status of the previous calendar day

  for (const key of days) {
    const status = statusOf(key, set, today);
    if (status === 'done') {
      run += 1;
      if (run > longest) longest = run;
    } else if (status === 'missed') {
      if (prev === 'missed') {
        // Second consecutive miss → the streak breaks here.
        lastBreakDate = key;
        run = 0;
      }
      // First miss in a row is forgiven: run is left untouched.
    }
    // 'pending' (today, not yet done) changes nothing.
    prev = status;
  }

  return { current: run, longest, lastBreakDate };
}

/**
 * FR-4 trigger condition: yesterday was missed AND today is not yet done.
 * When true, the higher-urgency "day 2" alert applies instead of the
 * ordinary morning copy.
 */
export function needsSafeguard(checkIns, today = dayKey()) {
  const yesterday = addDays(today, -1);
  return (
    statusOf(yesterday, checkIns, today) === 'missed' &&
    statusOf(today, checkIns, today) === 'pending'
  );
}

/** Convenience: today's status. */
export function todayStatus(checkIns, today = dayKey()) {
  return statusOf(today, checkIns, today);
}

/** Build a colored chain for a date range (inclusive) for the grid UI. */
export function chain(startKey, endKey, checkIns, today = dayKey()) {
  return rangeKeys(startKey, endKey).map((date) => ({
    date,
    status: statusOf(date, checkIns, today),
    color: colorOf(date, checkIns, today),
  }));
}
