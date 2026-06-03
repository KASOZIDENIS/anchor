# Anchor — Personal Consistency App
### Requirements Specification (v1)

> **Working name:** *Anchor* (because the whole thing hangs off your morning anchor). Rename it whatever you like — *Mirror*, *Streak*, *The Chain*. The name is yours.

> **One-line purpose:** Get me to do one small thing every morning, never let a quiet week slip past unnoticed, and never make me feel guilty about the things I've deliberately put down.

---

## 1. Problem & Goals

I'm a full-time QA tester who wants to build a daily learning habit (programming-for-QA via Coursera). My specific failure pattern is:

1. **Hard to get started** — when something feels big or optional, I do nothing.
2. **I get bored** and drift away from courses.
3. **A week passes before I notice** the habit went quiet — nothing sounds the alarm.

This app is **not a general to-do list or project manager.** It does one job: protect a single daily habit and make lapses impossible to ignore.

**Success looks like:**
- Opening the app and checking in takes under 5 seconds.
- A single missed day can't quietly turn into a lost week.
- I can *see* my parked responsibilities without them nagging me daily.

---

## 2. Who It's For

| | |
|---|---|
| **User** | One person (me). Single-user, no accounts at launch. |
| **Context** | Full-time job with variable downtime. Learns best **in the morning before work.** |
| **Pain to solve** | Starting friction + boredom-driven drift + invisible lapses. |
| **Device** | Phone-first (the reminder needs to reach me where I am). |

---

## 3. Design Principles
*These are the non-negotiable rules. Every feature must obey them. If a feature fights a principle, the principle wins.*

- **P1 — Lowest possible starting bar.** The daily action is a single tap meaning "I showed up." The minimum to count is *one lesson or 20 minutes, whichever is smaller.* The app never asks for more.
- **P2 — Anchored, not scheduled.** The morning reminder is meant to land alongside an existing ritual (coffee, sitting at the desk), not at an arbitrary clock time I'll learn to ignore.
- **P3 — Day 2 is the red line.** One missed day is forgivable and must *not* feel like failure. Two missed days in a row is the only thing that breaks the streak — and the app's job is to scream on day 2, not day 7.
- **P4 — Build over consume.** The habit is about *making* something, not watching video. The app gently captures "what I built" and "where I used it at work," because applied learning doesn't get boring.
- **P5 — Reflect, don't nag.** Parked and seasonal responsibilities are visible so I trust I won't forget them — but they stay silent until they're actually relevant. No guilt-by-list.
- **P6 — The app itself stays tiny.** Build the MVP, ship it, use it. Do not let *building the app* become another stalled, over-scoped project. (Same disease we're curing.)

---

## 4. Core Concepts (Data Model Sketch)

| Entity | Key fields | Notes |
|---|---|---|
| **Habit** | id, name, minimum_rule (default "1 lesson / 20 min"), reminder_time | MVP supports exactly **one** habit. |
| **DayRecord** | date (local), status (`done` / `missed`), checked_in_at, build_note (optional) | One per calendar day. |
| **Streak** | current_length, longest_length, last_break_date | Derived from DayRecords using the rule in §4.1. |
| **Reminder** | type (`morning` / `day2_alert` / `weekly_review`), time, enabled | Local notifications. |
| **ParkedItem** | id, title, type (`seasonal` / `someday`), wake_up_date (optional) | The anti-guilt list (§5, FR-7). |

### 4.1 Streak Rule (the heart of the app — define precisely)

- A **day** = one calendar day in the user's local timezone.
- A day is `done` if the user checked in, else `missed` once that day ends.
- **A single isolated `missed` day does NOT break the streak.** If the user checks in the next day, the streak continues uninterrupted (the miss is shown in *amber* — recoverable).
- **The streak breaks (resets to 0) only when two consecutive days are `missed`.** The second consecutive miss is shown in *red*.
- `longest_length` records the best forgiving streak ever achieved.

This is what makes "missing once is fine, missing twice is the red line" literally true in the data.

---

## 5. Functional Requirements

> **Phase tags:** `[MVP]` = build this first. `[P2]` = next. `[Later]` = only after the habit itself is sticking.

### FR-1 — Daily Check-In `[MVP]`
**Story:** As the user, I want to mark "I showed up today" in one tap, so starting never feels like a chore.

**Acceptance criteria**
- The home screen shows one large, obvious **Check In** button.
- Tapping it sets today's `DayRecord.status = done` and records the time.
- Once checked in, the button changes to a clear "Done for today ✓" state.
- Checking in is **idempotent** — tapping again the same day does nothing new (no double-counting).

---

### FR-2 — Streak & "Don't Break the Chain" `[MVP]`
**Story:** As the user, I want to see my streak and a visual chain of days, so I'm motivated to keep it alive and can *see* a lapse forming.

**Acceptance criteria**
- The current streak number is the most prominent element on the home screen.
- A calendar/grid shows recent days color-coded: **green** = done, **amber** = single recoverable miss, **red** = break (second consecutive miss), grey = future.
- Streak length is computed per the rule in §4.1 (forgiving single miss, breaks on two).
- Longest streak is displayed somewhere secondary.

---

### FR-3 — Morning Reminder `[MVP]`
**Story:** As the user, I want a gentle nudge in the morning, set to coincide with my coffee/desk routine, so the ritual reminds me instead of my memory.

**Acceptance criteria**
- User sets a reminder time (default suggestion: a typical pre-work morning time).
- Onboarding explicitly prompts: *"Set this to match something you already do every morning."*
- A local notification fires daily at that time **only if not yet checked in.**
- Notification copy is encouraging, not scolding (e.g., *"Morning — one lesson keeps the chain alive."*).
- No notification fires on a day already checked in.

---

### FR-4 — Two-Miss Safeguard `[MVP]` ← *the differentiator*
**Story:** As the user, I want the app to escalate the moment I'm at risk of a *second* missed day, so a single slip never becomes a lost week.

**Acceptance criteria**
- **Given** yesterday's status is `missed` **and** today is not yet `done`, **when** it reaches the user's reminder time (and optionally a second time later in the day), **then** a distinct, higher-urgency notification fires: *"You missed yesterday. Don't miss today — this is the one that counts."*
- This day-2 alert is visually/tonally distinct from the ordinary morning reminder.
- It does **not** fire after an ordinary single done→miss if today has already been completed.
- It stops firing the instant today is checked in.

---

### FR-5 — Build-and-Apply Log `[P2]`
**Story:** As the user, I want to jot what I built and where I used it at work, so my learning stays concrete (and therefore not boring).

**Acceptance criteria**
- After check-in, an **optional** one-line field appears: *"What did you build / where will you use it?"*
- Skipping it is frictionless — it never blocks check-in (respects P1).
- Past notes are viewable as a simple reverse-chronological list.

---

### FR-6 — Weekly Review `[P2]`
**Story:** As the user, I want a 60-second weekly glance, so I deliberately notice the week instead of letting it vanish.

**Acceptance criteria**
- A weekly notification (default: Sunday) prompts a review.
- The review screen shows: days done this week, current streak, and the week's build-notes.
- It is read-only and takes seconds — no required input.

---

### FR-7 — Parked & Seasonal Items `[P2]` ← *the anti-guilt feature*
**Story:** As the user, I want my deliberately-paused responsibilities listed quietly with optional wake-up dates, so I trust I won't forget them without being nagged daily.

**Acceptance criteria**
- A separate, secondary screen lists parked items (e.g., *"WLF partnerships," "general Wiki contributions"*).
- Each item may have an optional **wake-up date**.
- Parked items generate **no daily reminders.**
- **Given** an item's wake-up date arrives, **then** it surfaces once with a single gentle notification (e.g., *"WLF season is approaching — time to start partnerships."*).
- "Someday" items with no date stay silent indefinitely.

---

### FR-8 — Multiple Habits `[Later]`
Support a second habit **only** after the first is consistently sticking. Deliberately deferred to protect P1 and P6.

---

## 6. Non-Functional Requirements

- **NFR-1 Speed.** App opens and check-in completes in under 5 seconds, cold start.
- **NFR-2 Offline-first.** All core functions work with no internet. Data stored locally.
- **NFR-3 Privacy.** No account, no cloud, no tracking at launch. The data is mine and stays on-device.
- **NFR-4 Reliable notifications.** Reminders must fire reliably even if the app isn't open (proper OS-level local notifications).
- **NFR-5 Minimal UI.** Home screen = today's status + streak + one check-in button. Nothing else competing for attention.
- **NFR-6 Data safety.** A simple manual export/backup so a phone reset never wipes the streak (can be `[P2]`).

---

## 7. Explicitly Out of Scope
*Naming what it will NOT do is how we keep it tiny (P6).*

- ❌ A general to-do list or task/project manager.
- ❌ Social features, sharing, leaderboards, or friends.
- ❌ Cloud accounts or multi-device sync (at launch).
- ❌ Gamification beyond the streak (no points, badges, levels).
- ❌ Detailed analytics or charts.
- ❌ Multiple habits at launch (see FR-8).

---

## 8. MVP Definition

The smallest version worth using is **FR-1 + FR-2 + FR-3 + FR-4**:

> Check in with one tap → see a forgiving streak and color-coded chain → get a gentle morning reminder → get a louder alert the moment a *second* miss is at risk.

That alone solves all three of my problems (starting, lapsing invisibly, and guilt-free forgiveness of one miss). Everything in Phase 2 is enhancement.

---

## 9. Build Phases

| Phase | Includes | Why |
|---|---|---|
| **Phase 1 (MVP)** | FR-1, FR-2, FR-3, FR-4 | The core loop + the safeguard. Ship this and *use it.* |
| **Phase 2** | FR-5, FR-6, FR-7, NFR-6 | Depth: meaning, reflection, anti-guilt parking. |
| **Later** | FR-8, sync, themes, strict-streak option | Only once the habit is proven. |

---

## Appendix A — Example Test Cases
*(In your QA format — these cover the streak/safeguard logic, which is the riskiest part to get right. Includes happy path, edge cases, and a negative test.)*

```
TC-001: Streak increments on consecutive check-ins
Description: Verify a normal run increases the streak by one each day.
Preconditions: Fresh habit, streak = 0.
Steps:
  1. Check in on Day 1.
  2. Advance to Day 2; check in.
  3. Advance to Day 3; check in.
Expected Result: Current streak = 3; all three days shown green.
Pass/Fail: [ ]

TC-002: Single miss is forgiven (recoverable)
Description: Verify one isolated miss does NOT break the streak.
Preconditions: Streak = 3 (Days 1–3 done).
Steps:
  1. Do NOT check in on Day 4; let the day end.
  2. Check in on Day 5.
Expected Result: Streak continues (= 4, counting Day 5); Day 4 shown amber, not red; no break recorded.
Pass/Fail: [ ]

TC-003: Two consecutive misses break the streak
Description: Verify the streak resets only on a second consecutive miss.
Preconditions: Streak = 4 (last day done was Day 3, Day 4 amber/missed... see note).
Steps:
  1. Have one missed day (amber).
  2. Miss the very next day too (no check-in, day ends).
Expected Result: Streak resets to 0; second missed day shown red; last_break_date updated.
Pass/Fail: [ ]

TC-004 (negative): Double check-in same day does not double-count
Description: Ensure check-in is idempotent.
Preconditions: Today not yet checked in.
Steps:
  1. Tap Check In.
  2. Tap Check In again the same day.
Expected Result: Streak increases by exactly 1; button stays in "Done for today" state; no error.
Pass/Fail: [ ]

TC-005: Day-2 safeguard alert fires correctly
Description: Verify the escalation notification triggers after exactly one missed day.
Preconditions: Yesterday = missed; today not yet done.
Steps:
  1. Reach the configured reminder time today.
Expected Result: A distinct higher-urgency "day 2" notification fires (not the ordinary morning copy).
Pass/Fail: [ ]

TC-006 (edge): Safeguard alert suppressed once today is done
Description: Verify the day-2 alert stops after check-in.
Preconditions: Yesterday = missed; today's day-2 alert is scheduled.
Steps:
  1. Check in early today, before the alert time.
  2. Reach the alert time.
Expected Result: No day-2 notification fires.
Pass/Fail: [ ]

TC-007 (edge): Midnight rollover marks an uncompleted day as missed
Description: Verify day boundaries use local timezone.
Preconditions: Today not checked in.
Steps:
  1. Let local clock pass midnight without checking in.
Expected Result: Previous day's status becomes 'missed'; new day starts fresh.
Pass/Fail: [ ]
```

---

## Appendix B — Decisions To Make
Quick choices for you before/while building:

1. **Platform:** native phone app, or a installable web app (PWA)? (Notifications are the deciding factor — both can do it, native is most reliable.)
2. **Reminder time(s):** one morning nudge, or morning + a gentle evening "haven't checked in yet" fallback?
3. **Snooze:** allow one snooze, or none? (Recommend: at most one, to avoid an infinite snooze loop.)
4. **Rest days:** allow planned rest days that don't count as misses, or keep MVP strictly daily? (Recommend: strictly daily for MVP — simpler, and the forgiving single-miss rule already provides slack.)
