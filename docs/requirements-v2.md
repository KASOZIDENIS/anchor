# Anchor — Personal Consistency & Planning App
### Requirements Specification (v2.1)

> **Working name:** *Anchor* (the whole thing hangs off your morning anchor). Rename it freely — *Mirror*, *Streak*, *The Chain*.

> **One-line purpose:** Do one small thing every morning, plan the week realistically around what's actually on my calendar, give every task its own time slot, sound an alarm when a block ends — and never let a quiet week or a blown plan turn into guilt or a lost week.

---

## Changelog

### v2.1 — Review pass (no feature scope removed)
Hardening of the v2 spec after a build-readiness review:
- **Fixed cross-references:** FR-11 now correctly cites NFR-5 (reliable alarms) and NFR-6 (DND); the dangling "NFR-7/NFR-8" references are gone.
- **Resolved a contradiction:** real calendars can double-book, so *fixed* blocks may overlap each other (surfaced as a conflict) — only *flexible* overlaps are prevented (§4.2).
- **Defined the habit-core ↔ planner seam:** completing the protected habit block and the FR-1 check-in are the same event (§4.2).
- **Filled data-model gaps:** added `Task.priority`, a new **Settings** entity (working window / capacity / buffer / granularity), and alarm loop/auto-dismiss fields.
- **Clarified logic:** auto-schedule placement order, buffers around fixed blocks, "wake-up date is near" threshold, calendar edge cases (all-day / recurring / declined / timezone), OAuth single-user practicalities.
- **Platform call elevated:** FR-11 now states its PWA degradation explicitly; Appendix B #1 made decision-forcing.
- **Phasing split:** Phase 3 → **3a (local planner)** + **3b (calendar)** so Google isn't a blocker for the planner.
- **Added NFR-8** (v1→v2 data migration) and tightened the test suite (TC-009 rewritten; TC-015 closed-app alarm and TC-016 overlapping events added).

### v2 — Planner layer
v1 was a single-habit consistency tracker. v2 adds a full **daily planner** layer on top of that core:

- **FR-9 Weekly Planning Intake** — the app asks what I have on / want to do for the week, with room to adjust each day.
- **FR-10 Time-Blocked Schedule** — every task gets its own start–end block, shown as a Today timeline.
- **FR-11 End-of-Block Ringtone** — an alarm sounds when each block's time ends.
- **FR-12 Google Calendar (read-only)** — the app pulls my real commitments and plans around them.
- **Supporting:** FR-13 Overrun & Re-plan, FR-14 Daily Adjustment, FR-15 Carry-over, FR-16 Overpacked-day Guard.
- **Principles added:** P7 (schedule is a guide, not a cage), P8 (the habit block is sacred), P9 (plan from reality).
- **Revised:** NFRs (now optionally online for calendar), Out-of-Scope (scheduling is now *in* scope), Phases (new Phase 3).

**The v1 habit core (FR-1–FR-4) is unchanged and is still the foundation.** The planner sits on top of it; it does not replace it.

---

## 1. Problem & Goals

I'm a full-time QA tester who wants to (a) build a daily learning habit and (b) run my days from a realistic plan instead of a swirl of "I should be doing something." My failure patterns:

1. **Hard to get started** — big or optional things → I do nothing.
2. **I get bored** and drift from courses.
3. **A week passes before I notice** the habit went quiet.
4. **No structure to my time** — tasks float without a slot, so they don't happen, and what *is* committed (calendar) isn't reflected anywhere.

**Success looks like:**
- Checking in takes under 5 seconds (habit core).
- Every task I care about has a *time*, not just a place on a list.
- The plan is built around my real calendar commitments.
- A blown block or a single missed day never feels like the day/week is ruined.

---

## 2. Who It's For

| | |
|---|---|
| **User** | One person (me). Single-user, no accounts for the core app. |
| **Context** | Full-time job with variable downtime. Learns best **in the morning before work.** Keeps commitments in **Google Calendar.** |
| **Pain to solve** | Starting friction + boredom drift + invisible lapses + unstructured, un-timed tasks. |
| **Device** | Phone-first (reminders and alarms must reach me). |

---

## 3. Design Principles
*Non-negotiable. Every feature obeys these. If a feature fights a principle, the principle wins.*

- **P1 — Lowest possible starting bar.** The daily habit action is one tap = "I showed up." Minimum to count: *one lesson or 20 minutes, whichever is smaller.*
- **P2 — Anchored, not scheduled.** The morning habit reminder lands alongside an existing ritual (coffee, sitting at the desk), not an arbitrary clock time.
- **P3 — Day 2 is the red line.** One missed habit-day is forgivable. Two in a row is the only thing that breaks the streak — and the app screams on day 2, not day 7.
- **P4 — Build over consume.** Learning is about *making*, not watching. The app captures "what I built / where I used it."
- **P5 — Reflect, don't nag.** Parked items and unfinished tasks are visible so I trust I won't forget them — but never used to shame me.
- **P6 — The app stays tiny.** Ship the MVP, use it. Don't let *building the app* become another stalled, over-scoped project.
- **P7 — The schedule is a guide, not a cage.** *(New — and critical.)* A block running over does NOT mean the day is ruined. An overrun triggers a 10-second re-plan, never abandonment. This is the time-blocking version of the forgiving streak: one slip ≠ give up.
- **P8 — The habit block is sacred.** *(New.)* Whatever else fills the day, the morning learning block is protected. The planner defends it and warns before letting anything displace it.
- **P9 — Plan from reality.** *(New.)* The week is planned around **fixed calendar events first**, then flexible tasks fill the gaps. The plan never pretends committed time is free.

---

## 4. Core Concepts (Data Model Sketch)

| Entity | Key fields | Notes |
|---|---|---|
| **Habit** | id, name, minimum_rule, reminder_time | MVP supports exactly one habit. |
| **DayRecord** | date, status (`done`/`missed`), checked_in_at, build_note | Drives the streak (§4.1). |
| **Streak** | current_length, longest_length, last_break_date | Forgiving rule, §4.1. |
| **Task** | id, title, estimate_minutes, **priority**, kind (`fixed`/`flexible`), source (`manual`/`calendar`/`habit`), status (`planned`/`done`/`skipped`/`carried`), block_id | The unit of planning. `priority` orders auto-scheduling and overpack trimming. A `source: habit` task's completion **is** the FR-1 check-in (same event — see §4.2). |
| **ScheduleBlock** | id, date, start, end, task_id, is_protected, buffer_after_min | A task placed in time. |
| **WeekPlan** | week_start, intended_tasks[] (per day) | The weekly template; daily edits don't rewrite it. |
| **CalendarConnection** | provider (`google`), status, scope (`read_only`), last_sync | Optional integration. |
| **AlarmSetting** | ringtone, volume, style (`gentle`/`firm`), pre_end_warning_min, **loop_until_ack**, **auto_dismiss_sec**, override_dnd, per_task_overrides | Powers FR-11. |
| **Settings** | working_window (per-weekday start–end), day_capacity_min, default_buffer_min, block_granularity_min | Drives capacity (FR-16), buffers & snapping (§4.2). Defaults: 15-min granularity, 5-min buffer. |
| **ParkedItem** | id, title, type (`seasonal`/`someday`), wake_up_date | The anti-guilt list. |

### 4.1 Streak Rule (heart of the habit core)
- A **day** = a local-timezone calendar day; `done` if checked in, else `missed` once it ends.
- A **single isolated miss does NOT break the streak** — check in next day and it continues (shown *amber*).
- The streak **breaks only on two consecutive misses** (second miss shown *red*).
- `longest_length` records the best forgiving streak.

### 4.2 Scheduling Rules (heart of the planner)
- **Block kinds:** `fixed` (calendar events, appointments — the planner never auto-moves them) and `flexible` (tasks the planner may place and reflow).
- **Protected block:** the habit block is `flexible` but flagged `is_protected` — the planner won't drop it and warns before displacing it (P8). **Habit-core seam:** completing the protected habit block and the FR-1 check-in are the **same event** — doing either marks both done, and the streak (§4.1) is the source of truth for "did the habit happen today."
- **Buffers:** a default gap (Settings `default_buffer_min`, e.g. 5–10 min) is inserted between blocks — **including immediately before and after `fixed`/calendar blocks** — so the day isn't brittle back-to-back.
- **No overlap (flexible blocks):** the planner never *creates* two overlapping flexible blocks, and never places a flexible block over a fixed block. **Fixed/calendar blocks may legitimately overlap *each other*** (real calendars double-book); those are surfaced as a **conflict** for the user to resolve — never silently merged, dropped, or moved.
- **Placement order:** when auto-scheduling or re-planning, the **protected habit block is placed first**, then the remaining flexible tasks in **priority order** (ties → longest-first), first-fit into open gaps that respect buffers and snap to `block_granularity_min`. Anything that doesn't fit feeds the overpack guard (FR-16) and carry-over (FR-15).
- **Overrun & reflow:** if a flexible block reaches its end un-finished, the end-of-block alarm fires (FR-11) and the user picks **Done / Extend (+N) / Skip**. *Extend* reflows **later flexible blocks** forward; **fixed blocks are never moved.** If an extension would collide with a fixed block, the app warns and asks the user to decide.

---

## 5. Functional Requirements

> **Phase tags:** `[MVP]` build first · `[P2]` next · `[P3a]` local planner · `[P3b]` calendar layer · `[Later]` only once the rest is sticking.

### — Habit Core (v1) —

#### FR-1 — Daily Check-In `[MVP]`
**Story:** Mark "I showed up today" in one tap.
**Acceptance**
- Home screen has one large **Check In** button.
- Tapping sets today's `status = done`, records time, shows "Done for today ✓".
- Idempotent — tapping again the same day changes nothing.
- When the planner exists, this also marks the protected habit block done (§4.2).

#### FR-2 — Streak & "Don't Break the Chain" `[MVP]`
**Story:** See my streak and a color-coded chain of days.
**Acceptance**
- Current streak is the most prominent element.
- Grid: **green**=done, **amber**=single recoverable miss, **red**=break, grey=future.
- Streak computed per §4.1. Longest streak shown secondarily.

#### FR-3 — Morning Reminder `[MVP]`
**Story:** A gentle morning nudge timed to my existing routine.
**Acceptance**
- User sets a reminder time; onboarding says "set this to match something you already do every morning."
- Fires daily **only if not yet checked in**; encouraging, not scolding copy.

#### FR-4 — Two-Miss Safeguard `[MVP]` ← *differentiator*
**Story:** Escalate the moment a *second* missed day is at risk.
**Acceptance**
- **Given** yesterday = `missed` **and** today not yet `done`, **when** the reminder time hits, **then** a distinct higher-urgency alert fires ("You missed yesterday. Don't miss today — this is the one that counts.").
- Does not fire if today is already done; stops the instant today is checked in.

#### FR-5 — Build-and-Apply Log `[P2]`
**Story:** Jot what I built / where I used it.
**Acceptance:** Optional one-line field after check-in; skipping is frictionless; notes viewable as a list.

#### FR-6 — Weekly Review `[P2]`
**Story:** A 60-second weekly glance. *(Note: in v2 this pairs with FR-9 planning intake.)*
**Acceptance:** Weekly prompt shows days done, current streak, this week's build-notes; read-only.

#### FR-7 — Parked & Seasonal Items `[P2]` ← *anti-guilt*
**Story:** Quietly list paused responsibilities with optional wake-up dates.
**Acceptance:** Secondary screen; **no daily reminders**; an item surfaces once when its wake-up date arrives; dateless "someday" items stay silent.

#### FR-8 — Multiple Habits `[Later]`
Add a second habit only after the first is sticking. Deferred to protect P1/P6.

---

### — Planner Layer (v2) —

#### FR-9 — Weekly Planning Intake `[P3a]` *(calendar pre-fill activates in P3b)*
**Story:** At the start of each week, the app asks what I have on and what I want to get done — pre-filled from my calendar and parked items — and produces a plan I can adjust daily.
**Acceptance criteria**
- A weekly prompt (default **Sunday evening**, configurable) opens an intake flow.
- The intake **pre-populates** from: (a) this coming week's fixed Google Calendar events (read-only, FR-12 — *active once P3b ships; before that, intake is manual*), (b) the protected habit block (P8), and (c) carried-over unfinished tasks (FR-15) plus parked items whose **wake-up date falls within the planned week** (FR-7).
- For each thing I want to do, I add a **title + estimated duration + priority** and mark it `fixed` or `flexible`.
- Output is a **WeekPlan**: a per-day list of intended tasks.
- The realism check (FR-16) runs and warns if any day is over capacity.
- The WeekPlan is a **template** — editing one day (FR-14) does not rewrite the rest of the week (the "room for daily adjustment").

#### FR-10 — Time-Blocked Schedule `[P3a]`
**Story:** Give every task its own start–end slot and see today as an ordered timeline.
**Acceptance criteria**
- Each task can be assigned a **start and end time** (a `ScheduleBlock`); duration auto-fills the end from the estimate, and is editable. Times snap to `block_granularity_min` (default 15).
- A **Today** view shows all of today's blocks in chronological order, highlighting **current** and **next**.
- **Fixed** (calendar) blocks appear locked; **flexible** blocks are editable / draggable.
- **No two flexible blocks overlap, and no flexible block is placed over a fixed block** (§4.2); attempting an overlap warns.
- The **protected habit block** is always present and visually marked (P8).
- *(Nice-to-have within P3a)* **Auto-schedule**: place a day's flexible tasks into open gaps around fixed blocks — **in priority order, first-fit, snapping to granularity** and respecting buffers — predictable gap-filling only, no opaque AI rearranging.

#### FR-11 — End-of-Block Ringtone Alarm `[P3a]` ← *requested*
**Story:** Sound a ringtone when a block's time ends so I notice transitions.
**Acceptance criteria**
- When a block reaches its **end time**, an audible **ringtone** plays plus a notification.
- User configures **ringtone, volume, and style (gentle / firm)**; a **per-task override** is allowed (e.g., soft chime for deep work, louder for "leave now").
- An optional **pre-end warning** (e.g., 2 minutes before) can be enabled.
- The ringtone **loops until acknowledged** (`loop_until_ack`), with a configurable `auto_dismiss_sec` so a missed alarm eventually stops — a "leave now" alarm can't be slept through, but a forgotten one doesn't ring forever.
- On the alarm the user picks **Done / Extend (+N min) / Skip**, feeding FR-13.
- The alarm **fires reliably even when the app is closed or backgrounded** (**NFR-5**).
  - **⚠ Platform caveat (decision-forcing — see Appendix B #1):** this is only fully achievable in a **native** build. As a **PWA** it degrades to a best-effort notification: no guaranteed audio when the app is fully closed, and no DND override. Backgrounded-but-alive may still work via timers.
- Respects Do Not Disturb per **NFR-6**, with an explicit user choice on whether these alarms may override DND (a silenced alarm defeats the purpose). *(DND override is native-only.)*

#### FR-12 — Google Calendar Integration (read-only) `[P3b]` ← *requested*
**Story:** Connect my Google Calendar so the app plans around my real commitments.
**Acceptance criteria**
- User connects via **Google OAuth**, granting **read-only** calendar scope (least privilege).
- Upcoming events (configurable horizon, e.g., this week) import as **fixed blocks** in the schedule and feed the weekly intake (FR-9).
- **Event hygiene:** all-day and multi-day events are shown as context but **not** placed as timed blocks; **declined / tentative** invitations are excluded; **recurring** events are expanded within the horizon; each event is read in **its own timezone** and converted to local. Overlapping events surface as a conflict (§4.2), never silently merged.
- Events **refresh** on app open and on a periodic sync; edits made in Google reflect in the app.
- The app **never modifies** Google Calendar in v2 (read-only). Write-back is `[Later]`.
- **OAuth practicalities (single-user):** `calendar.readonly` is a Google *sensitive* scope. For personal use, keep the OAuth client in **"Testing" mode** with yourself as the sole test user — this avoids Google's app-verification + privacy-policy review entirely. With no backend (NFR-3), tokens live **only on-device**; access refreshes silently while a session is alive and re-auths otherwise.
- **Offline:** the app uses the last cached events and clearly marks them as possibly stale (NFR-2).
- The connection is **revocable in-app**; revoking removes imported events.

#### FR-13 — Overrun & Re-plan `[P3a]`
**Story:** When a block ends unfinished, recover in seconds instead of derailing (P7).
**Acceptance criteria**
- On the end-of-block alarm: **Done / Extend (+N) / Skip**.
- **Extend** reflows **later flexible blocks** forward; **fixed/calendar blocks are never moved.** A collision with a fixed block triggers a warning and a user decision.
- A one-tap **"Re-plan rest of day"** repacks remaining (not-yet-started) flexible tasks into the remaining open time (respecting buffers and the protected block, in priority order).
- No "failure" states or guilt language anywhere in this flow (P5/P7).

#### FR-14 — Daily Adjustment `[P3a]` ← *requested ("room for daily adjustment")*
**Story:** Each morning (or anytime) tweak *today* without disturbing the weekly template.
**Acceptance criteria**
- An **"Adjust Today"** view lets me add / remove / move / resize today's blocks.
- Edits apply to **today only**; the WeekPlan template is unchanged.
- Quick actions: **push everything back N minutes**, mark done/skip, drag to reorder.

#### FR-15 — Carry-over `[P3a]`
**Story:** Unfinished tasks shouldn't vanish silently.
**Acceptance criteria**
- At day end, incomplete flexible tasks are flagged.
- They appear as **suggested carry-overs** in the next day's "Adjust Today" and in the next weekly intake.
- I can carry over, reschedule, or drop — no guilt (P5).

#### FR-16 — Overpacked-day Guard `[P3a]` ← *anti-overwhelm*
**Story:** Warn me when I've planned more than the day can hold, so I plan from reality (P9), not wishful thinking.
**Acceptance criteria**
- The app sums scheduled durations + buffers per day against my **available hours** (the `working_window` in Settings).
- If a day is over capacity it **warns and suggests what to move or cut** (lowest-priority first, offering carry-over).
- Advisory only — it **never blocks** me from over-planning if I insist.

---

## 6. Non-Functional Requirements

- **NFR-1 Speed.** App opens and check-in completes in under 5 seconds, cold start.
- **NFR-2 Local-first.** Habit, tasks, schedule, and alarms work **fully offline.** Google Calendar sync requires connectivity; when offline the app falls back to **cached events** and flags them as possibly stale.
- **NFR-3 Privacy & least privilege.** No third-party account for the core app. The **only** external connection is the optional Google link, scoped **read-only calendar**. Calendar data is used solely to display and plan around events, cached locally, never shared, and the connection is revocable anytime.
- **NFR-4 Minimal UI.** Home = today's status + streak + check-in. The Today timeline is the second screen. Nothing fights for attention.
- **NFR-5 Reliable notifications & alarms.** The morning reminder, the day-2 safeguard, and **end-of-block ringtones** must fire even when the app is closed/backgrounded — use OS-level alarm/notification facilities. *(Full reliability for closed-app audio alarms is native-only; see FR-11 caveat and Appendix B #1.)*
- **NFR-6 Do Not Disturb.** The user explicitly chooses whether time-block alarms may override device DND; default is respectful. *(Override is native-only.)*
- **NFR-7 Data safety.** Simple manual export/backup so a phone reset never wipes streaks or plans (can be `[P2]`).
- **NFR-8 Migration & continuity.** A v2 upgrade must **preserve existing v1 data** — `Habit`, check-ins/`DayRecord`, `Streak`, build-notes, and parked items carry over without resetting the streak.

---

## 7. Explicitly Out of Scope
*Scope grew in v2 to include scheduling. These guardrails keep it from sprawling (P6):*

- ✅ **Now in scope:** time-blocking, weekly planning, end-of-block alarms, read-only calendar.
- ❌ A full **project manager** — no task dependencies, nested subtask trees, or Gantt charts.
- ❌ **Writing** to Google Calendar (deferred to `[Later]`).
- ❌ Other calendars (Outlook, Apple) at launch.
- ❌ **Opaque AI auto-planning** — gap-filling must be simple and predictable.
- ❌ Team / multi-user / sharing / social features.
- ❌ Gamification beyond the streak.

---

## 8. MVP Definition (unchanged)

The smallest version worth using is still the **habit core: FR-1 + FR-2 + FR-3 + FR-4.**

> Check in with one tap → see a forgiving streak and chain → gentle morning reminder → louder alert the moment a *second* miss is at risk.

Everything in the planner layer is built **on top of** a working habit core.

---

## 9. Build Phases

| Phase | Includes | Why |
|---|---|---|
| **Phase 1 (MVP)** | FR-1–FR-4 | The core loop + safeguard. The thing that actually fixes consistency. Ship and *use* it. |
| **Phase 2** | FR-5, FR-6, FR-7, NFR-7 | Meaning, reflection, anti-guilt parking. |
| **Phase 3a (Planner — local)** | FR-9 (manual intake), FR-10, FR-11, FR-13, FR-14, FR-15, FR-16 | The full planner — weekly intake, time-blocks, alarms, overrun re-plan, daily adjust, carry-over, overpack guard — **with no Google dependency.** Prove the planner first. |
| **Phase 3b (Calendar)** | FR-12 + calendar pre-fill of FR-9 | Plan around real commitments. The heaviest and most fragile piece (OAuth, sync, event edge cases), deliberately last. |
| **Later** | FR-8, calendar write-back, other calendars, themes, sync | Only once the rest is proven. |

> **Sequencing note:** the planner (Phase 3) is the powerful part you're excited about — but it's also the heaviest, and heavy-and-stalled is the exact trap we're escaping (P6). Strong recommendation: get the tiny habit core working and sticking *first* (a week or two of real use), then build the planner. The **3a/3b split matters**: the local planner (3a) delivers nearly all the day-to-day value and needs no Google integration, OAuth, or network. Treat calendar (3b) as a bonus layer, not a prerequisite — that way a stalled Google integration can never block the planner you'll actually use every day.

---

## Appendix A — Example Test Cases
*(Your QA format. Covers the riskiest logic: streak, schedule reflow, alarms, calendar, overrun. Happy path + edge + negative.)*

```
TC-001: Streak increments on consecutive check-ins
Preconditions: Fresh habit, streak = 0.
Steps: Check in Day 1; Day 2; Day 3.
Expected: Streak = 3; all three green.
Pass/Fail: [ ]

TC-002: Single miss is forgiven
Preconditions: Streak = 3.
Steps: Miss Day 4 (no check-in, day ends); check in Day 5.
Expected: Streak continues; Day 4 amber, not red; no break.
Pass/Fail: [ ]

TC-003: Two consecutive misses break the streak
Preconditions: One missed day (amber) already on record.
Steps: Miss the next day too.
Expected: Streak resets to 0; second missed day red.
Pass/Fail: [ ]

TC-004 (negative): Double check-in same day
Steps: Tap Check In twice in one day.
Expected: Streak +1 only; button stays "Done for today"; no error.
Pass/Fail: [ ]

TC-005: Day-2 safeguard alert fires
Preconditions: Yesterday missed; today not done.
Steps: Reach reminder time.
Expected: Distinct higher-urgency notification (not ordinary morning copy).
Pass/Fail: [ ]

TC-006: Calendar event imports as a fixed block
Preconditions: Google connected (read-only); an event exists tomorrow 10:00–11:00.
Steps: Open app / sync; view tomorrow's schedule.
Expected: A locked fixed block appears 10:00–11:00; cannot be auto-moved.
Pass/Fail: [ ]

TC-007: Overlap prevention for flexible blocks
Preconditions: A flexible block exists 09:00–09:30.
Steps: Try to schedule another flexible task 09:15–09:45.
Expected: App warns of overlap and refuses/repositions; no two flexible blocks overlap.
Pass/Fail: [ ]

TC-008: End-of-block ringtone fires (backgrounded)
Preconditions: A block ends at 09:30; app backgrounded (still alive).
Steps: Reach 09:30 without marking done.
Expected: Ringtone + notification fire; Done/Extend/Skip offered.
Pass/Fail: [ ]

TC-009: Overrun "Extend" reflows later flexible blocks; fixed blocks never move
Preconditions: A 09:00–09:30 (flexible), B 09:30–10:00 (flexible), fixed calendar block 10:00–11:00; buffer = 5 min.
Steps: On A's end alarm, choose Extend +20 min.
Expected: A → 09:00–09:50. Reflowing B after A (with the 5-min buffer) would place it 09:55–10:25, overlapping the fixed 10:00 block. The app does NOT move B onto the fixed block; it warns and offers "Re-plan rest of day" / carry-over. The fixed block is never moved.
Pass/Fail: [ ]

TC-010: Protected habit block defended
Steps: Auto-schedule a packed day, then try to delete/displace the habit block.
Expected: App warns before allowing the habit block to be removed or overwritten.
Pass/Fail: [ ]

TC-011: Daily adjustment doesn't alter the week template
Steps: In WeekPlan, edit today's blocks (move/resize); reopen tomorrow's plan.
Expected: Tomorrow is unchanged; only today was edited.
Pass/Fail: [ ]

TC-012: Carry-over of unfinished task
Preconditions: A flexible task left incomplete at day end.
Steps: Open next day's "Adjust Today" and next weekly intake.
Expected: Task appears as a suggested carry-over; can carry/reschedule/drop.
Pass/Fail: [ ]

TC-013 (edge): Offline calendar fallback
Preconditions: Google connected; device offline.
Steps: Open the schedule.
Expected: Cached events shown, flagged as possibly stale; app still usable.
Pass/Fail: [ ]

TC-014 (edge): Overpacked-day warning
Steps: Plan tasks whose durations + buffers exceed the day's available hours.
Expected: Advisory warning with move/cut suggestions (lowest-priority first); planning not blocked.
Pass/Fail: [ ]

TC-015 (edge): End-of-block alarm with the app FULLY CLOSED
Preconditions: A block ends at 09:30; app force-closed (not just backgrounded).
Steps: Reach 09:30.
Expected (native build): ringtone + notification fire reliably.
Expected (PWA build): best-effort only — may not fire; documents the platform limit that drives Appendix B #1.
Pass/Fail: [ ]

TC-016 (edge): Overlapping calendar events surface as a conflict
Preconditions: Google connected; two events overlap (10:00–11:00 and 10:30–11:30).
Steps: Sync; view the day.
Expected: Both appear as fixed blocks flagged as a conflict for the user to resolve; neither is silently dropped, merged, or auto-moved.
Pass/Fail: [ ]

TC-017 (integration): Check-in and habit block stay in sync
Preconditions: Planner active; today's protected habit block not yet done.
Steps: Tap Check In on the home screen.
Expected: The habit block shows done AND the streak increments — one action, both reflect it.
Pass/Fail: [ ]
```

---

## Appendix B — Decisions To Make
Quick choices before/while building:

1. **Platform — decide this first (FR-11 forces it).** Native phone app or installable web app (PWA)? End-of-block alarms that fire when the app is *closed*, custom ringtones, and DND-override are **native-only**; a PWA can do everything else but degrades FR-11 to best-effort notifications. You already have a working **v1 PWA** — decide whether reliable alarms justify a native path (e.g. **Capacitor** can wrap the existing web app into a native shell and reuse the v1 code, rather than a rewrite), or whether best-effort alarms are acceptable for now.
2. **Planning cadence:** weekly intake on Sunday evening? Monday morning? Allow both?
3. **Block granularity:** 15- or 30-minute snapping? *(Recommended default: 15 min — set in Settings.)*
4. **Default buffer** between blocks? *(Recommended default: 5 min — set in Settings.)*
5. **Ringtone defaults:** one global tone, or distinct tones for "block ending" vs "leave now"? Per-task override on by default?
6. **DND override:** should end-of-block alarms pierce Do Not Disturb by default, or stay silent? *(Native-only; default respectful.)*
7. **Calendar horizon:** import just this week, or a rolling 7/14 days?
8. **Calendar scope:** confirm read-only for v2 (recommended); revisit write-back later.
9. **Rest days:** allow planned rest days for the habit, or keep strictly daily? (Recommend strictly daily for MVP; the forgiving single-miss rule already gives slack.)
