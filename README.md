# Anchor

A tiny personal consistency app. It does one job: protect a single daily habit and
make lapses impossible to ignore. Built as an offline-first installable PWA — one
codebase, no account, no cloud, your data stays on your device.

> Miss once, it's fine (amber). Miss twice in a row, the app shouts (red). That's
> the whole idea.

Built from the requirements spec in [`docs/`](docs/): [v1 — implemented](docs/requirements-v1.md) and [v2.1 — planned planner layer](docs/requirements-v2.md).

---

## Run it

You need [Node.js](https://nodejs.org) (only for the dev server and tests — the app
itself is plain HTML/CSS/JS with zero runtime dependencies).

```bash
cd anchor
node serve.js            # → http://localhost:8080   (or: node serve.js 3000)
```

Open `http://localhost:8080` on your computer. On `localhost` the service worker is
active, so it installs and works fully offline.

### Install on your phone

Service workers (offline + background notifications) require a **secure context
(HTTPS)**, which `localhost` satisfies but a plain `http://192.168.x.x` LAN address
does not. To get Anchor onto your phone, host the `anchor/` folder on any static
HTTPS host — all free, all a one-time drop:

- **Netlify Drop** — drag the `anchor` folder onto <https://app.netlify.com/drop>.
- **GitHub Pages** — push the folder, enable Pages.
- **Vercel / Cloudflare Pages** — point at the folder.
- A quick **tunnel** (`cloudflared tunnel --url http://localhost:8080`) for testing.

Then on the phone: open the URL → browser menu → **Add to Home Screen**. It launches
full-screen like a native app.

> Over plain `http` on your LAN the app still *runs* (check-ins, streak, everything in
> localStorage) — you just don't get the installable/offline service-worker layer.

---

## A straight answer on notifications (NFR-4)

This is the one place a PWA can't fully match native. There is **no cross-platform way
to guarantee a local notification fires while the app is completely closed** — iOS in
particular restricts this heavily for web apps. Anchor uses a layered, honest strategy
so the *intent* of FR-3/FR-4 ("a quiet week can't slip past") still holds:

1. **Notification Triggers** (`TimestampTrigger`) — real background delivery on
   Chrome/Edge/Android, even when the app is closed.
2. **Foreground timers** — fire reliably while the app is open.
3. **Surface-on-open** — if a nudge is overdue when you open the app, it shows
   immediately. A habit app gets opened ~daily, so nothing rots for a week.

The schedule is rebuilt every time you open the app, check in, or change settings, so
scheduled notifications always match reality (a day you've completed never nags you).

If you find background notifications unreliable on your specific phone, that's the
known PWA limitation — and the moment a native build is worth it (FR-8 territory), the
streak logic and data model here port straight over.

---

## What's built

| Req | Feature | Status |
|---|---|---|
| FR-1 | One-tap daily check-in, idempotent | ✅ |
| FR-2 | Streak + color-coded chain (green/amber/red) | ✅ |
| FR-3 | Morning reminder, only if not checked in | ✅ |
| FR-4 | **Two-miss safeguard** — louder day-2 alert | ✅ |
| FR-5 | Build-and-apply log | ✅ |
| FR-6 | Weekly review | ✅ |
| FR-7 | Parked & seasonal items (anti-guilt list) | ✅ |
| NFR-6 | Manual export / import backup | ✅ |
| FR-8 | Multiple habits | ⏸ deferred by design (P6) |

### Decisions made (Appendix B)

1. **Platform:** PWA — fastest to ship from Windows, honors P6.
2. **Reminders:** morning anchor **+ gentle evening fallback**.
3. **Snooze:** one snooze max (+60 min), then no more that day.
4. **Rest days:** strictly daily for MVP — the forgiving single-miss rule already
   provides the slack.

---

## The streak rule (§4.1), exactly

Implemented in [`js/streak.js`](js/streak.js) as pure functions:

- A **day** is one calendar day in your **local** timezone.
- `done` = checked in. `pending` = today, not yet done. `missed` = a past day with no
  check-in.
- A **single** isolated miss does **not** break the streak (shown **amber**).
- The streak resets to 0 **only on two consecutive misses**; the second is the break
  (shown **red**).
- `longest` records the best forgiving streak ever.

## Tests

The riskiest logic — the streak and the safeguard — is covered by Appendix A's test
cases, executable:

```bash
npm test          # or: node --test
```

All seven spec cases (TC-001 … TC-007) plus extra edge guards run green.

---

## Files

```
anchor/
  index.html              app shell
  styles.css              calm, phone-first, dark
  manifest.webmanifest    PWA manifest
  sw.js                   service worker (offline cache + notification clicks/snooze)
  serve.js                zero-dep local static server
  icons/icon.svg          app icon
  js/
    app.js                UI, navigation, lifecycle
    streak.js             §4.1 streak engine (pure — the heart)
    dates.js              local-timezone day helpers
    storage.js            localStorage persistence + export/import
    notifications.js      reminder planning & delivery
  tests/
    streak.test.js        Appendix A, executable
```

## Privacy

No account, no server, no analytics, no network calls. Everything lives in your
browser's localStorage on one device. Use **Settings → Export** to keep a backup so a
phone reset never wipes your streak.
