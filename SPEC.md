# Period Tracker PWA — Build Spec

You are building a privacy-first period/cycle tracking Progressive Web App (PWA) for a small group of friends, used mostly on iPhones. This document is the single source of truth. Read it fully before writing code.

---

## 0. Working rules for the coding agent

1. Build **milestone by milestone** (Section 14). Finish one, run tests, summarise what was done, and commit before starting the next.
2. Build the **prediction engine test-first** (Vitest). The engine is the heart of the app and must be correct.
3. **Do not add dependencies** beyond those in Section 2 without asking first.
4. **Never add analytics, tracking, crash reporting, ad SDKs, CDNs, remote fonts, or any external network request** other than Supabase.
5. If anything in this spec is ambiguous or seems wrong, **ask before guessing**.
6. Use **TypeScript** (strict mode) everywhere.
7. Keep the engine (`src/engine/`) **pure**: no React, no Dexie, no `Date.now()`. Every function that depends on "today" takes `today` as a parameter.
8. When a step needs the human to do something manually (Supabase dashboard, GitHub settings, env vars), stop and list the exact steps.

---

## 1. Product principles

- **The phone is the primary store** (IndexedDB). The app must work fully offline.
- **Supabase is only a backup copy** (one JSON snapshot per user). v1 backups are **not encrypted**; encryption is planned for v2, so keep the backup a single blob to make that easy.
- **Predictions are never stored.** Everything (periods, cycles, predictions, accuracy, patterns) is **derived** from `dailyLogs` on every render, so logging/editing updates everything instantly.
- **One source of truth:** daily flow logs. Periods are derived from them.
- Not medical advice. Ovulation/fertile estimates are **not** for contraception.

---

## 2. Tech stack

| Layer | Tool |
|---|---|
| Language | TypeScript (strict) |
| UI | React |
| Build | Vite |
| PWA | `vite-plugin-pwa` (manifest + service worker, offline precache) |
| Local DB | IndexedDB via `dexie` + `dexie-react-hooks` (`useLiveQuery`) |
| Dates | `date-fns` |
| Backup + auth | Supabase via `@supabase/supabase-js` (Postgres + Auth, email OTP code) |
| Tests | `vitest` |
| Fonts | Self-hosted (e.g. `@fontsource/*`) — never Google Fonts CDN |
| Charts | Hand-written SVG components (no chart library) |
| Hosting | GitHub Pages, deployed via GitHub Actions |

**No router library.** Use simple state-based tab navigation (avoids GitHub Pages 404 issues with client-side routes).

---

## 3. Date handling (critical)

- All dates are stored and passed around as **`"YYYY-MM-DD"` strings** (type `ISODate`), in the user's local calendar.
- Never store timestamps for calendar dates. Never use `new Date("YYYY-MM-DD")` directly (it parses as UTC). Write helpers in `src/engine/dates.ts`: `parseISODate`, `toISODate`, `addDays`, `diffDays`, `todayISO()` (the only place allowed to read the clock — lives outside the engine, e.g. `src/lib/today.ts`).
- `diffDays(a, b)` returns whole calendar days.

---

## 4. Data model (Dexie, `src/db/`)

```ts
type ISODate = string; // "YYYY-MM-DD"
type Flow = 'light' | 'medium' | 'heavy';      // NO spotting option
type Symptom =
  | 'cramps' | 'headache' | 'bloating' | 'back_pain' | 'breast_tenderness'
  | 'acne' | 'fatigue' | 'cravings' | 'nausea' | 'digestive_issues' | 'trouble_sleeping';
type Mood = 'happy' | 'calm' | 'energetic' | 'sad' | 'anxious' | 'irritable' | 'low_energy';

interface DailyLog {
  date: ISODate;          // primary key
  flow: Flow | null;
  symptoms: Symptom[];
  moods: Mood[];          // multi-select
  notes: string;
  updatedAt: number;      // ms timestamp, for backup bookkeeping only
}

interface Pause {          // prediction pauses (hormonal birth control, pregnancy, etc.)
  id?: number;
  start: ISODate;
  end: ISODate | null;    // null = ongoing
  label?: string;
}

interface Settings {       // single row, key = 'main'
  key: 'main';
  onboardingCycleLength: number | null;   // null = "not sure" → use 28
  onboardingPeriodLength: number;         // default 5
  onboardingDone: boolean;
  funMode: boolean;                       // default true
  showFertileWindow: boolean;             // default false
  lastBackupAt: number | null;
  lastMessage: { date: ISODate; id: string } | null;
  recentMessageIds: string[];             // last 5 shown, to avoid repeats
}
```

Dexie schema v1:
```
dailyLogs: '&date'
pauses:    '++id, start'
settings:  '&key'
```

- A `DailyLog` row with `flow === null`, no symptoms, no moods and empty notes should be **deleted** rather than stored.
- On first launch call `navigator.storage.persist()` (ignore failure).

---

## 5. Logging behaviour

1. **"Log period"** button (Today screen, and "Period started this day" in the day editor for past dates):
   - Fill `startDate … startDate + (estimatedPeriodLength − 1)` with `flow: 'medium'` **only on days that have no flow yet**.
2. **"Period ended"** (shown while in a period): sets `flow = null` for all days **after today** that belong to the current period.
3. The **day editor** (opened from the calendar or Today) lets the user set flow (none/light/medium/heavy), symptoms, moods and notes for any date, past or future.
4. All edits write to Dexie; UI re-derives everything via `useLiveQuery`.

---

## 6. Prediction engine (`src/engine/`) — the DSAI core

All functions are pure. Suggested files: `dates.ts`, `periods.ts`, `cycles.ts`, `estimate.ts`, `forecast.ts`, `status.ts`, `backtest.ts`, `patterns.ts`, `stats.ts`, `constants.ts`.

### 6.1 Constants (`constants.ts`)

```ts
DEFAULT_CYCLE = 28
DEFAULT_PERIOD = 5
PRIOR_WEIGHT_K = 2          // onboarding value counts as 2 cycles during cold start
WINDOW = 6                  // use last 6 valid cycles / periods
MIN_CYCLES_FOR_MEDIAN = 3
DEFAULT_SIGMA = 2           // days, when < 3 valid cycles
SKIP_RATIO = 1.6            // gap ≥ 1.6 × baseline → skipped period(s)
SHORT_RATIO = 0.6           // gap < 0.6 × baseline → short/anomalous cycle
MIN_CYCLE_DAYS = 15         // gap < 15 days → short/anomalous cycle
IRREGULAR_SIGMA = 7         // σ > 7 → irregular mode
IRREGULAR_SKIPS = 2         // ≥ 2 skipped periods in last 365 days → irregular mode
LUTEAL_DAYS = 14            // ovulation = next period start − 14
OVULATION_SPREAD = 2        // ± days of luteal variation
PMS_DAYS = 5
POSSIBLY_SKIPPED_RATIO = 0.6 // daysLate ≥ round(0.6 × L) → "possibly skipped"
HORIZON_MONTHS = 6
HORIZON_MONTHS_IRREGULAR = 3
PATTERN_THRESHOLD = 0.6
PATTERN_MIN_CYCLES = 3
BACKTEST_MIN = 3
```

### 6.2 Derive periods (`periods.ts`)

`derivePeriods(logs): Period[]` where `Period = { start, end, length }`.

- Sort days with `flow !== null`.
- Consecutive flow days form one period. A **single** empty day between flow days does **not** split a period (gap of 1 empty day merges; 2+ empty days splits).
- `length = diffDays(end, start) + 1`.

### 6.3 Derive and classify cycles (`cycles.ts`)

`deriveCycles(periods, pauses, onboarding): Cycle[]`

```ts
type CycleStatus = 'valid' | 'skipped' | 'short' | 'paused';
interface Cycle {
  start: ISODate;        // period start
  nextStart: ISODate;    // next period start
  length: number;        // diffDays(nextStart, start)
  status: CycleStatus;
  skippedCount: number;  // only for 'skipped'
}
```

Process gaps **chronologically** so classification only uses the past (this also makes backtesting honest):

1. `baseline` = the cycle-length estimate (6.4) computed from **valid cycles before this one** (or onboarding/default if none).
2. If the gap overlaps any pause → `paused`.
3. Else if `length < MIN_CYCLE_DAYS` or `length < SHORT_RATIO × baseline` → `short` (excluded from averages; surfaced in Insights as "unusual short cycle").
4. Else if `length ≥ SKIP_RATIO × baseline` → `skipped`, `skippedCount = max(1, round(length / baseline) − 1)`.
5. Else → `valid`.

Only `valid` cycles feed averages, σ, and patterns.

### 6.4 Estimates (`estimate.ts`)

`estimateCycle(validCycles, onboardingCycleLength) → { length, sigma, n, method }`

- `L0 = onboardingCycleLength ?? DEFAULT_CYCLE`. Use the **last `WINDOW` valid cycles**, `n` = their count.
- `n = 0` → `L = L0`, `method: 'onboarding'`.
- `n = 1–2` → **blend**: `L = (K·L0 + ΣCᵢ) / (K + n)`, `method: 'blend'`.
- `n ≥ 3` → `L = median(last WINDOW cycles)`, `method: 'median'`.
- Round `L` to the nearest whole day.
- `sigma` = sample standard deviation (n−1) of the last `WINDOW` valid cycles if `n ≥ 3`, else `DEFAULT_SIGMA`.

`estimatePeriodLength(periods, onboardingPeriodLength)`:
- Median of the last `WINDOW` complete periods' lengths if ≥ 3 periods; else blend with onboarding the same way (K = 2); round.
- Exclude the current period if it may still be ongoing (its end ≥ today − 1).

`isIrregular = sigma > IRREGULAR_SIGMA || skippedInLast365 ≥ IRREGULAR_SKIPS`.

### 6.5 Forecast (`forecast.ts`)

`forecast({ periods, cycles, estimates, pauses, today }) → PredictedCycle[]`

```ts
interface PredictedCycle {
  k: number;                          // 1 = next period
  periodStart: ISODate;               // point estimate
  periodEnd: ISODate;                 // start + periodLength − 1
  rangeStart: ISODate; rangeEnd: ISODate;          // dotted range for the start date
  ovulation: ISODate;                 // periodStart − LUTEAL_DAYS
  ovulationRangeStart: ISODate; ovulationRangeEnd: ISODate;
  fertileStart: ISODate; fertileEnd: ISODate;      // ovulation − 5 … ovulation + 1
  lowConfidence: boolean;             // true in irregular mode
}
```

- Anchor = start of the last logged period.
- k-th predicted start = `anchor + k × L`.
- Start range = `± max(1, round(sigma × √k))`.
- Ovulation range = `± (OVULATION_SPREAD + max(1, round(sigma × √k)))`.
- Also return the **ovulation of the current cycle** (relative to k = 1) so the calendar can show it.
- **Late / possibly skipped roll-forward:** if `today ≥ anchor + L` and no new period is logged:
  - While `daysLate < round(POSSIBLY_SKIPPED_RATIO × L)`: k = 1 stays at its date (shown as "late"); further forecasts continue from it.
  - Once possibly skipped: shift the anchor forward by whole cycles until the next predicted start is `> today`, and forecast from there.
- Horizon: `HORIZON_MONTHS` (or `HORIZON_MONTHS_IRREGULAR` in irregular mode).
- If `today` is inside an active pause → return `[]`.
- If there are no periods at all → return `[]`.

### 6.6 Status (`status.ts`)

`getStatus({...derived, today}) → Status`

```ts
type Phase = 'period' | 'follicular' | 'ovulation' | 'luteal' | 'pms' | 'late' | 'possibly_skipped' | 'paused' | 'no_data';
interface Status {
  phase: Phase;
  cycleDay: number | null;      // 1 = first day of last period
  daysUntilNext: number | null;
  daysLate: number | null;
  irregular: boolean;
}
```

Phase rules (first match wins):
1. Inside a pause → `paused`. No periods → `no_data`.
2. Today is a logged flow day of the current period → `period`.
3. `daysLate ≥ round(0.6 × L)` → `possibly_skipped`; `daysLate > 0` → `late`.
4. Within `ovulation ± 1` of the current cycle → `ovulation`.
5. Within the last `PMS_DAYS` before the predicted start → `pms`.
6. After the ovulation window → `luteal`.
7. Otherwise → `follicular`.

### 6.7 Accuracy tracking — walk-forward backtest (`backtest.ts`)

`backtest(logs, pauses, onboarding) → { errors: {date, error}[], mae, bias, n }`

1. For each period start `Pᵢ` (i ≥ 1), simulate `today = Pᵢ − 1 day` using **only logs dated before `Pᵢ`**.
2. Run the normal pipeline and take the k = 1 prediction.
3. Skip targets whose preceding gap is classified `skipped`, `short` or `paused`.
4. `error = diffDays(actual, predicted)` (positive = came late).
5. `mae` = mean absolute error, `bias` = mean error. Only show in UI when `n ≥ BACKTEST_MIN`.
6. UI copy: "Predictions are usually accurate within ±{round(mae)} days" and, if `|bias| ≥ 1`, "Your period tends to come {|bias|} day(s) {early/late}".

### 6.8 Symptom patterns (`patterns.ts`)

`symptomPatterns(logs, cycles) → Pattern[]`

- Use only `valid` cycles that contain **at least one log of any kind** (so not-logging isn't counted as "no symptom").
- Require `≥ PATTERN_MIN_CYCLES` such cycles.
- Two reference frames for each symptom:
  - **After start:** cycle day `d = diffDays(date, start) + 1`, for d in 1…15.
  - **Before next:** `b = diffDays(nextStart, date)`, for b in 1…10.
- For each symptom and each position, compute the fraction of eligible cycles where the symptom appears within **±1 day** of that position.
- Positions with fraction `≥ PATTERN_THRESHOLD` form windows; merge contiguous positions. Prefer the frame with the higher peak fraction; don't report the same symptom twice for overlapping windows.
- Output: `{ symptom, frame: 'after_start' | 'before_next', from, to, fraction }`.
- UI copy examples: "Cramps usually on days 1–2", "Headaches often 2 days before your period".

### 6.9 Required engine tests (Vitest)

Write these before implementation (create logs from lists of period start dates + lengths via a test helper):

1. **Period derivation:** single empty day merges; two empty days split.
2. **Cold start:** onboarding 30, one cycle of 26 → `L = round((2·30 + 26)/3) = 29`, method `blend`.
3. **Regular cycles:** six 28-day cycles → L = 28, next start = last + 28.
4. **One skipped month:** cycles 28, 29, 27, then a 58-day gap → gap is `skipped` with `skippedCount = 1`; L stays 28.
5. **Two skipped months:** cycles 28, 30, 29, then 88 → `skipped`, `skippedCount = 2`.
6. **Short cycle:** a 10-day gap → `short`, excluded.
7. **Irregular:** cycles 21, 36, 26, 40, 23, 34 → sample σ ≈ 7.7 → irregular, low confidence, 3-month horizon.
8. **Range widening:** σ = 3 → k=1 ±3, k=4 ±6.
9. **Late → possibly skipped:** L = 30, 10 days late → `late`; 18 days late → `possibly_skipped` and forecasts roll forward past today.
10. **Pause:** today inside a pause → no forecasts, phase `paused`; paused gaps excluded from averages.
11. **Backtest:** perfectly regular history → mae 0; history with a skipped gap excludes that target.
12. **Patterns:** cramps on days 1–2 in 4 of 5 cycles → pattern reported; in 2 of 5 → not reported; cycles with no logs are ignored.
13. **Dates:** no off-by-one across month/year boundaries and DST changes.

---

## 7. Screens (`src/screens/`)

Bottom tab bar: **Today · Calendar · Insights · Settings**. Mobile-first.

### Today
- Big cycle status: "Day 12 of ~29", phase name, next period countdown or "Late by X days" / "Possibly skipped".
- Phase message (Section 8).
- Primary button: **Log period** (or **Period ended** while in a period).
- Quick-log for today: flow, symptoms, moods, notes (opens day editor).
- Irregular-mode note when applicable.

### Calendar
- Month view, swipe/arrows between months, jump to today.
- Visual encoding:

| Element | Style |
|---|---|
| Logged period day | Solid fill, intensity by flow (light/medium/heavy) |
| Predicted period day | Light fill |
| Predicted period start range | Dotted outline |
| Predicted ovulation day | Distinct accent colour |
| Ovulation range | Dotted outline in accent colour |
| Fertile window | Only if `showFertileWindow`; subtle tint |
| Today | Ring/marker |
| Day with symptoms/moods/notes | Small dot |

- Legend available.
- Tap a day → day editor sheet (with "Period started this day").

### Insights
- Average cycle length + how it's computed ("median of your last 5 cycles" / "based on your setup answer").
- Average period length.
- Variability (σ) and regular/irregular label.
- Prediction accuracy (6.7) once available.
- Symptom patterns (6.8) once available; otherwise "Log symptoms for 3+ cycles to see patterns".
- Cycle history bar chart (SVG): valid cycles as bars, skipped/short/paused gaps visually marked.
- If skipped periods happen repeatedly: a gentle, non-alarming note suggesting checking in with a doctor.

### Settings
- Onboarding values (editable), with a note that they're only used until there's enough history.
- Fun mode toggle; Show fertile window toggle (with "estimate, not contraception").
- Manage pauses (add/end/delete).
- Backup section (Section 9): sign in, back up now, last backup time, restore, delete my backup, sign out.
- Export JSON / Import JSON (local file).
- About + disclaimers + "what we store" note.

### Onboarding (first launch)
1. Welcome + short privacy note (data stays on the phone; optional backup to the developer's Supabase, readable by the developer in v1).
2. Typical cycle length (stepper, default 28, "Not sure" option).
3. Typical period length (default 5).
4. Last period start date (required).
5. Add earlier periods (optional, encouraged): list of start dates + lengths.
6. Optional: sign in for backup (skippable).
7. Fun mode on/off.

---

## 8. Phase messages

- File: `src/content/messages.json`:
```json
{
  "period": [{ "id": "p1", "text": "Your uterus is doing its monthly renovation. Excuse the noise." }],
  "follicular": [{ "id": "f1", "text": "Energy's back. Main character arc unlocked." }],
  "ovulation": [{ "id": "o1", "text": "Hormones are peaking. You may feel unreasonably confident today. Use it wisely." }],
  "luteal": [{ "id": "l1", "text": "Slowing down a little is allowed." }],
  "pms": [{ "id": "s1", "text": "You're not being dramatic. It's progesterone." }],
  "late": [{ "id": "x1", "text": "Your period is a little later than predicted. Cycles shift with stress, travel and sleep." }],
  "possibly_skipped": [{ "id": "y1", "text": "Looks like this cycle may have been skipped. Predictions have moved to your next likely period." }],
  "paused": [{ "id": "z1", "text": "Predictions are paused." }],
  "no_data": [{ "id": "n1", "text": "Log your period to get started." }],
  "neutral": [{ "id": "u1", "text": "Day {cycleDay} of your cycle." }]
}
```
- Write **~10 original, kind, funny messages** for each of `period`, `follicular`, `ovulation`, `luteal`, `pms`. Humour about cramps, cravings, energy, mood — never body-shaming, and keep ovulation messages about energy/mood (not fertility or sex).
- `late`, `possibly_skipped`, `paused`, `no_data` are **always neutral and calm** (no jokes), regardless of fun mode.
- If `funMode` is off, use `neutral` messages for all non-neutral phases.
- Selection: one message per day (store in `settings.lastMessage`), random within the phase, never one of `recentMessageIds` (last 5).
- Support `{cycleDay}` and `{daysUntilNext}` placeholders.

---

## 9. Backup (Supabase)

### 9.1 Manual setup (human does this — list these steps when you reach Milestone 8)
1. Create a Supabase project (pick the Mumbai / `ap-south-1` region).
2. Run this SQL:
```sql
create table public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.backups enable row level security;

create policy "backups_select_own" on public.backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "backups_insert_own" on public.backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "backups_update_own" on public.backups
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "backups_delete_own" on public.backups
  for delete to authenticated using ((select auth.uid()) = user_id);
```
3. Auth → enable Email provider. Edit the email template so it contains the 6-digit code (`{{ .Token }}`) — we use **OTP codes, not magic links** (magic links open in Safari, not in the installed iPhone PWA, so the session would land in the wrong storage).
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon/publishable key only) to `.env.local` and as GitHub Actions secrets. **Never** put the service-role/secret key in the frontend or repo. Add `.env*` to `.gitignore`.
5. If the default email sender's rate limit becomes a problem, configure custom SMTP.

### 9.2 Auth flow
- `signInWithOtp({ email })` → user enters the 6-digit code → `verifyOtp({ email, token, type: 'email' })`.

### 9.3 Snapshot format
```ts
interface BackupSnapshot {
  schemaVersion: 1;
  exportedAt: string;   // ISO timestamp
  dailyLogs: DailyLog[];
  pauses: Pause[];
  settings: Omit<Settings, 'lastBackupAt' | 'lastMessage' | 'recentMessageIds'>;
}
```
Same format is used for local JSON export/import.

### 9.4 Behaviour
- **Auto backup:** when signed in and online, upsert the snapshot ~10 s after the last local change (debounced), and on the `online` event if there are unsynced changes. Update `lastBackupAt` on success.
- **Manual:** "Back up now" button.
- **Restore:** after sign-in, if a remote backup exists: show "Backup from {date} found. Restore?" Restoring **replaces** local data inside one Dexie transaction. **Never overwrite local or remote data without explicit confirmation** — if both local data and a remote backup exist and differ, ask which to keep.
- **Delete my backup:** deletes the user's row (confirm first). Full account deletion needs an Edge Function → v2.
- Show a "Last backup: X days ago" reminder in Settings, and a banner on Today if > 14 days and not signed in.
- All backup code lives in `src/lib/backup.ts`; the app must work normally if Supabase is unreachable or not configured.

---

## 10. PWA requirements (iPhone-first)

- `vite-plugin-pwa` with `registerType: 'autoUpdate'`, precache all app assets; app works fully offline (except backup).
- Manifest: name, short name, `display: 'standalone'`, theme/background colours, icons 192 and 512 (+ maskable).
- iOS extras in `index.html`: `apple-touch-icon` (180×180), `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, viewport with `viewport-fit=cover`.
- Respect safe areas with `env(safe-area-inset-*)` (notch, home indicator) — especially the bottom tab bar.
- Settings/onboarding should show a short "Add to Home Screen" guide for iPhone (Share → Add to Home Screen), and note that the Home Screen app has **separate storage from Safari**, so always open it from the icon.
- Add a restrictive Content Security Policy meta tag allowing only self + the Supabase project URL.

---

## 11. Design direction

- Clean, warm, friendly, mobile-first; avoid an over-the-top pink stereotype. Support **light and dark mode** via CSS variables.
- Large tap targets (≥ 44px), logging a period should take 1–2 taps.
- Keep styles in plain CSS (CSS modules or a single variables file). The owner is a UI/UX designer and may supply designs later — keep visual tokens (colours, radii, spacing, fonts) centralised so they're easy to swap.
- Accessible: sufficient contrast, labels for icon buttons, don't rely on colour alone (dotted vs solid outlines help here).

---

## 12. Project structure

```
src/
  engine/          pure logic + *.test.ts
  db/              Dexie schema, queries, hooks (useLogs, useSettings, usePauses)
  lib/             supabase client, backup, today(), export/import
  screens/         Today, Calendar, Insights, Settings, Onboarding
  components/      DayEditor, CalendarMonth, TabBar, charts, etc.
  content/         messages.json
  styles/          tokens.css, global.css
public/            icons
.github/workflows/ deploy.yml
```

- A `useDerived()` hook combines live Dexie data + `todayISO()` and runs the engine (memoised), so every screen reads from one place.

---

## 13. Deployment (GitHub Pages)

- Vite `base` set to `/<repo-name>/`; make sure the service worker scope and manifest `start_url`/`scope` match.
- GitHub Actions workflow: install → test → build → deploy to Pages. Tests must pass for deploy.
- Provide a README with local dev, env vars, Supabase setup and deploy steps.

---

## 14. Milestones (build in this order)

1. **Setup:** Vite + React + TS, Vitest, lint/format, folder structure, README skeleton.
2. **Data layer:** Dexie schema, typed queries, hooks, persistent storage request.
3. **Engine + tests:** everything in Section 6, all tests in 6.9 passing.
4. **Logging + Calendar:** day editor, Log period / Period ended, calendar with all visual states.
5. **Onboarding** (including past periods).
6. **Today screen + phase messages** (write the message bank).
7. **PWA:** manifest, service worker, iOS meta, safe areas, CSP; deploy to GitHub Pages and hand over for real-iPhone testing.
8. **Supabase auth + backup/restore + local export/import** (list manual setup steps first).
9. **Insights:** averages, variability, accuracy, symptom patterns, history chart.
10. **Polish:** dark mode, accessibility pass, empty states, final README.

### Out of scope for v1 (planned v2)
- Encrypting the backup blob with a user passphrase (Web Crypto, AES-GCM + PBKDF2) before upload.
- Custom symptoms/moods.
- Account deletion via Supabase Edge Function.
- Calendar (.ics) export for reminders.
- App lock / PIN.

---

## 15. Disclaimers (show in onboarding and About)
- Predictions are estimates based on your logged history, not medical advice.
- Ovulation and fertile-window estimates are **not** reliable for contraception.
- In v1, backups are stored unencrypted in the app owner's Supabase project.
