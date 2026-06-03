// Appendix A test cases, executable. Run with: npm test  (node --test)
//
// These cover the streak/safeguard logic — the riskiest part to get right.
// Each test names the spec's TC id so a failure points straight at the
// acceptance criterion it violates.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStreak, colorOf, statusOf, needsSafeguard } from '../js/streak.js';
import { planned } from '../js/notifications.js';
import { checkIn, isCheckedIn, defaultState } from '../js/storage.js';
import { addDays, fromKey } from '../js/dates.js';

const TODAY = '2026-06-03';
const d = (n) => addDays(TODAY, n); // d(0)=today, d(-1)=yesterday, ...

test('TC-001: streak increments on consecutive check-ins', () => {
  const checkIns = { [d(-2)]: 1, [d(-1)]: 1, [d(0)]: 1 };
  const { current, longest } = computeStreak(checkIns, TODAY);
  assert.equal(current, 3, 'three consecutive days → streak 3');
  assert.equal(longest, 3);
  for (const k of [d(-2), d(-1), d(0)]) {
    assert.equal(colorOf(k, checkIns, TODAY), 'green', `${k} should be green`);
  }
});

test('TC-002: single miss is forgiven (recoverable)', () => {
  // Days 1-3 done, Day 4 missed, Day 5 (today) done.
  const checkIns = { [d(-4)]: 1, [d(-3)]: 1, [d(-2)]: 1, [d(0)]: 1 };
  const { current, longest, lastBreakDate } = computeStreak(checkIns, TODAY);
  assert.equal(current, 4, 'isolated miss does not break; streak counts the 4 done days');
  assert.equal(longest, 4);
  assert.equal(lastBreakDate, null, 'no break recorded');
  assert.equal(colorOf(d(-1), checkIns, TODAY), 'amber', 'the single miss is amber, not red');
});

test('TC-003: two consecutive misses break the streak', () => {
  // Days 1-3 done, then Day 4 and Day 5 both missed (today = Day 6).
  const checkIns = { [d(-5)]: 1, [d(-4)]: 1, [d(-3)]: 1 };
  const { current, longest, lastBreakDate } = computeStreak(checkIns, TODAY);
  assert.equal(current, 0, 'two consecutive misses reset the streak to 0');
  assert.equal(longest, 3, 'best forgiving streak is preserved as longest');
  assert.equal(lastBreakDate, d(-1), 'break recorded on the second consecutive miss');
  assert.equal(colorOf(d(-2), checkIns, TODAY), 'amber', 'first miss = amber');
  assert.equal(colorOf(d(-1), checkIns, TODAY), 'red', 'second consecutive miss = red');
});

test('TC-004 (negative): double check-in same day does not double-count', () => {
  const state = defaultState();
  checkIn(state, TODAY);
  const firstAt = state.checkIns[TODAY].at;
  checkIn(state, TODAY); // tap again same day
  assert.equal(Object.keys(state.checkIns).length, 1, 'still exactly one record for today');
  assert.equal(state.checkIns[TODAY].at, firstAt, 'timestamp not overwritten');
  assert.equal(isCheckedIn(state, TODAY), true);
  assert.equal(computeStreak(state.checkIns, TODAY).current, 1, 'streak increases by exactly 1');
});

test('TC-005: day-2 safeguard alert fires correctly', () => {
  // Established habit, yesterday missed, today not yet done.
  const state = defaultState();
  state.reminders.enabled = true;
  state.reminders.morningTime = '07:30';
  state.checkIns = { [d(-2)]: { at: 'x', note: null } }; // yesterday d(-1) is a miss

  assert.equal(needsSafeguard(state.checkIns, TODAY), true);

  const now = fromKey(TODAY); now.setHours(6, 0, 0, 0); // before the morning anchor
  const plan = planned(state, now);
  const day2 = plan.find((p) => p.tag.startsWith('anchor:day2:'));
  assert.ok(day2, 'a distinct day-2 payload is scheduled');
  assert.equal(day2.urgent, true, 'day-2 alert is higher-urgency');
  assert.ok(
    !plan.some((p) => p.tag === `anchor:morning:${TODAY}`),
    'the ordinary morning copy is NOT used for today when the safeguard applies'
  );
});

test('TC-006 (edge): safeguard alert suppressed once today is done', () => {
  const state = defaultState();
  state.reminders.enabled = true;
  state.reminders.morningTime = '07:30';
  state.checkIns = { [d(-2)]: { at: 'x', note: null } };
  checkIn(state, TODAY); // check in early, before the alert time

  assert.equal(needsSafeguard(state.checkIns, TODAY), false);

  const now = fromKey(TODAY); now.setHours(6, 0, 0, 0);
  const plan = planned(state, now);
  assert.ok(!plan.some((p) => p.tag.startsWith('anchor:day2')), 'no day-2 alert after check-in');
  assert.ok(!plan.some((p) => p.tag === `anchor:morning:${TODAY}`), 'no morning nudge today after check-in');
});

test('TC-007 (edge): midnight rollover marks an uncompleted day as missed', () => {
  const checkIns = {}; // today not checked in
  // While it is still "today", the day is pending (not a miss).
  assert.equal(statusOf(TODAY, checkIns, TODAY), 'pending');
  // After the local clock passes midnight (today advances), it is missed.
  assert.equal(statusOf(TODAY, checkIns, addDays(TODAY, 1)), 'missed');
  // ...and the new day starts fresh as pending.
  assert.equal(statusOf(addDays(TODAY, 1), checkIns, addDays(TODAY, 1)), 'pending');
});

// --- A couple of extra guards beyond Appendix A ---------------------------

test('three consecutive misses: second and third are both red, streak stays 0', () => {
  const checkIns = { [d(-5)]: 1, [d(-4)]: 1 };
  // d(-3) miss (amber), d(-2) miss (red, break), d(-1) miss (red), today pending
  assert.equal(colorOf(d(-3), checkIns, TODAY), 'amber');
  assert.equal(colorOf(d(-2), checkIns, TODAY), 'red');
  assert.equal(colorOf(d(-1), checkIns, TODAY), 'red');
  assert.equal(computeStreak(checkIns, TODAY).current, 0);
});

test('recovery after a break starts a fresh streak', () => {
  // done, miss, miss (break), then two done days up to today.
  const checkIns = { [d(-4)]: 1, [d(-1)]: 1, [d(0)]: 1 };
  const { current } = computeStreak(checkIns, TODAY);
  assert.equal(current, 2, 'streak restarts and counts only post-break done days');
});
