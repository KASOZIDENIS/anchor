// dates.js — local-timezone day helpers.
//
// A "day" in Anchor is one calendar day in the user's LOCAL timezone (§4.1).
// We represent days as ISO date keys 'YYYY-MM-DD' built from local time —
// never UTC — so midnight rollover happens at the user's real midnight (TC-007).

/** Local 'YYYY-MM-DD' key for a Date (defaults to now). */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a 'YYYY-MM-DD' key into a local Date at midnight. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Return the key `n` days after `key` (n may be negative). */
export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole-day difference a - b (both keys). Positive if a is later. */
export function dayDiff(a, b) {
  const ms = fromKey(a).getTime() - fromKey(b).getTime();
  return Math.round(ms / 86400000);
}

/** Inclusive list of day keys from `start` to `end`. */
export function rangeKeys(start, end) {
  const out = [];
  if (dayDiff(end, start) < 0) return out;
  let cur = start;
  while (dayDiff(end, cur) >= 0) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Monday-based start-of-week key for the week containing `key`. */
export function startOfWeek(key) {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(key, -dow);
}

/** Short human label, e.g. "Mon 3". */
export function shortLabel(key) {
  const d = fromKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** Long human label, e.g. "Monday, 3 June". */
export function longLabel(key) {
  const d = fromKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
