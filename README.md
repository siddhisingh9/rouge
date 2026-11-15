# Rouge

A privacy-first period and cycle tracker for a small group of friends. It's an installable
PWA, built mainly for iPhone.

- **Your phone is the primary store.** Everything lives in IndexedDB and works offline.
- **Backup is optional.** It's one JSON snapshot per user in Supabase. In v1 the backup is _not_
  encrypted.
- **No analytics, tracking or third-party requests.** Supabase is the only network call, and
  only once backup is set up.
- **Not medical advice.** Predictions are estimates from your logged history. Ovulation and
  fertile-window estimates are _not_ reliable for contraception.

## Features

- **Today:** cycle day, the current phase, when the next period is due (or how late it is), and
  a daily message (playful in fun mode, plain otherwise). One tap logs a period, or ends one.
  It also has a quick log for today's symptoms, mood and notes.
- **Calendar:** logged flow, predicted periods, estimated ovulation, the optional fertile window,
  and dotted outlines for possible date ranges. Tap any day to edit it. Swipe or use the arrows
  to change month.
- **Insights:** average cycle and period length, with how each was worked out; how regular your
  cycles are; how accurate past predictions were; recurring symptom patterns; a cycle history
  chart. If periods are skipped repeatedly, a gentle note suggests mentioning it to a doctor.
- **Settings:** setup answers, fun mode, fertile window, pauses (for example hormonal birth
  control or pregnancy), the iPhone install guide, backup, export / import, and an About section.
- **Onboarding:** usual cycle and period length (or "not sure"), the last period and any earlier
  ones, optional backup sign-in, and fun mode.

## How predictions work

All prediction logic is pure TypeScript in `src/engine/`. Nothing is stored: it's recalculated
from your logs every time. In short:

1. **Periods** are runs of flow days. One empty day in the middle doesn't split a period.
2. **Cycles** are the gaps between period starts. Each gap is checked only against the
   history before it: `paused` if it overlaps a pause, `short` if it's under 15 days or under
   0.6× the usual length, `skipped` if it's at least 1.6× the usual length, otherwise `valid`.
   Only valid cycles count towards averages.
3. **Cycle length** comes from your setup answer at first. With 1–2 cycles it blends that
   answer with your logged cycles. From 3 cycles on, it's the median of your last 6. Period
   length works the same way.
4. **Forecasts** get wider ranges further ahead (±σ√k). Irregular cycles (σ > 7 days, or 2+
   skipped periods in a year) are marked low confidence and forecast 3 months ahead instead
   of 6.
5. **Late / possibly skipped:** a late period keeps its predicted date until it's about 60% of
   a cycle late. After that, predictions move on to the next likely period.
6. **Accuracy** is measured with a walk-forward backtest: each past period is predicted using
   only the data from before it.
7. **Symptom patterns** are symptoms logged near the same cycle day (±1 day) in at least 60% of
   valid cycles. A cycle where you logged flow but no symptoms counts as "no symptom".

All the numbers are in `src/engine/constants.ts`.

## Tech stack

TypeScript (strict) · React 19 · Vite · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) ·
Supabase (optional backup) · Vitest · ESLint · Prettier

Dates are plain `YYYY-MM-DD` strings, and all date maths uses whole days in UTC, so time zones
and daylight saving can't shift a date. `src/lib/today.ts` is the only place that reads the
clock.

## Local development

Requires Node 22 (the version CI uses).

```bash
npm install
npm run dev          # dev server at http://localhost:5173/rouge/
npm test             # run all tests once
npm run test:watch   # run the tests in watch mode
npm run lint         # ESLint
npm run format       # Prettier (write); CI runs format:check
npm run typecheck    # tsc, no emit
npm run build        # typecheck + production build
```

**Tests.** The engine tests (`src/engine/*.test.ts`) cover every scenario in SPEC.md §6.9. The
date tests also run across six time zones. The database tests use `fake-indexeddb`. The
`src/lib` tests cover the logic behind the screens: calendar layout, onboarding validation,
messages, backup sync decisions, snapshots and Insights copy.

## Project structure

```
src/
  engine/       pure prediction logic + tests (no React, no Dexie, no clock; enforced by ESLint)
  db/           Dexie schema, typed queries, React hooks, persistent-storage request
  lib/          screen logic: today(), derived state, messages, calendar model, backup,
                snapshot/export/import, Insights copy (most with tests)
  screens/      Today, Calendar, Insights, Settings, Onboarding
  components/   DayEditor, CalendarMonth, CycleHistoryChart, TabBar, backup UI, small controls
  content/      messages.json (daily messages), labels.ts (display names)
  styles/       tokens.css (design tokens), global.css
public/         icons
.github/workflows/  deploy.yml
```

## Design, theming and accessibility

- Every colour, font size, space and radius is a token in `src/styles/tokens.css`. Components
  only use `var(--…)`, so a new design means editing that one file.
- **Light and dark mode** follow the phone's setting (`prefers-color-scheme`). Each colour has a
  dark-mode value, and the browser UI colour (`theme-color`) matches.
- **Accessibility:** colour is never the only signal. Calendar days have spoken descriptions
  and dotted outlines for ranges. The history chart has striped bars, word labels and a hidden
  data table. Tap targets are at least 44 px, focus outlines show for keyboard users, and the
  switch animation respects reduced motion. Text meets WCAG AA contrast in both themes. An axe
  audit of every screen, in both themes, reports no issues.

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in:

| Variable                 | Value                                              |
| ------------------------ | -------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL, e.g. `https://abcd1234.supabase.co`   |
| `VITE_SUPABASE_ANON_KEY` | The **publishable** (anon) key, `sb_publishable_…` |

Never use the secret / service-role key here: anything starting with `VITE_` is public, and that
key bypasses row-level security.

Both are optional. Without them the app works normally: backup is hidden, and export / import
still works. They're built into the app at build time, so add the same values as GitHub Actions
secrets for the deployed site. The Supabase URL is also added to the Content Security Policy
automatically.

## Supabase setup

Backup is one JSON snapshot per user in a `backups` table. Row-level security (RLS) means each
user can only read and write their own row. Sign-in uses a **6-digit email code**, not a magic
link, because a link would open in Safari rather than the installed app.

1. Create a project at [supabase.com](https://supabase.com) in the **Mumbai (`ap-south-1`)**
   region. While creating it, leave GitHub unconnected, keep **Enable Data API** on, turn
   **Automatically expose new tables** off, and turn **Enable automatic RLS** on.
2. In the **SQL Editor**, run the SQL in [SPEC.md §9.1](SPEC.md) (table + RLS policies), then
   this grant. It's needed because new tables aren't exposed automatically; RLS still limits
   each user to their own row, and signed-out visitors get no access.

   ```sql
   grant select, insert, update, delete on public.backups to authenticated;
   ```

3. In **Authentication → Sign In / Providers**, make sure **Email** is enabled.
4. Set up **custom SMTP** under **Authentication → SMTP Settings**. Supabase's built-in sender
   only emails members of your Supabase organisation, a few times an hour, and it won't let
   you edit the templates. A Gmail account with an
   [app password](https://myaccount.google.com/apppasswords) works: host `smtp.gmail.com`,
   port `587`, with that Gmail address as the username and sender. The app password needs
   2-Step Verification turned on. Brevo's free plan also works.
5. In **Authentication → Emails → Templates**, edit both **Magic Link** and **Confirm sign up**
   so they show the code and no link:

   ```html
   <h2>Your Rouge sign-in code</h2>
   <p>Enter this code in the Rouge app to sign in:</p>
   <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{{ .Token }}</p>
   <p>It expires shortly and can only be used once.</p>
   ```

6. In **Project Settings → API**, copy the Project URL and the publishable key into
   `.env.local` and the GitHub secrets (see above).

**How backup behaves** (`src/lib/backup.ts`, `src/components/BackupProvider.tsx`)

- When you're signed in and online, the app uploads a snapshot about 10 seconds after the last
  change, and again when the phone comes back online.
- It only uploads automatically when that can't overwrite anything you haven't seen: either
  there's no backup yet, or the backup is exactly what this phone last synced. Otherwise it
  asks:
  - **Backup found** (empty phone, e.g. a new phone): restore it?
  - **Both differ** (e.g. used on two phones): keep this phone's data, or use the backup.
- Restoring replaces local data in a single IndexedDB transaction.
- **Delete my backup** removes the row and signs out, so it isn't immediately re-created.
  Deleting the account itself needs an Edge Function and is planned for v2.
- In v1 backups are **not encrypted**, so the app owner can read them. Encryption is planned
  for v2.

## Deploying to GitHub Pages

The app is served at `https://<github-user>.github.io/rouge/`. The base path is set by `BASE` in
`vite.config.ts`; change it if the repository is renamed.

**One-time setup**

1. The repository must be **public** (GitHub Pages on a free account), or you need a paid plan.
2. In the repository on GitHub, set **Settings → Pages → Build and deployment → Source** to
   **GitHub Actions**.
3. Optional: add the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   under **Settings → Secrets and variables → Actions**. Without them, backup is unavailable.

**Every deploy**

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs lint, the format check,
the tests and the build, then publishes `dist/`. If any step fails, nothing is deployed. Follow
progress in the repository's **Actions** tab. You can also run it by hand from there
(**Deploy to GitHub Pages → Run workflow**).

To check a production build locally, run `npm run build && npm run preview`, then open
`http://localhost:4173/rouge/`.

**Offline and updates.** A service worker (vite-plugin-pwa) precaches the whole app, so it works
fully offline after the first visit. New versions install in the background and take effect the
next time the app is opened.

**Security.** Production builds include a Content Security Policy that only allows the app's own
origin, plus the Supabase project URL if it's set. The app makes no other network requests.

## Installing on iPhone

1. Open the app's URL in **Safari**.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. From then on, open Rouge **from the Home Screen icon**.

The Home Screen app has **separate storage from Safari**: anything logged in a Safari tab won't
appear in the installed app, and vice versa. Install first, then go through onboarding inside
the installed app. The app shows this guide on the welcome screen when it's opened in Safari on
an iPhone, and in Settings.

## Planned for v2

- Encrypting the backup with a passphrase (Web Crypto, AES-GCM + PBKDF2) before upload.
- Custom symptoms and moods.
- Account deletion (Supabase Edge Function).
- Calendar (.ics) export for reminders.
- App lock / PIN.
