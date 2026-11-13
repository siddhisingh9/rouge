# Rouge

A privacy-first period and cycle tracker for a small group of friends. Built as an installable PWA, mostly for iPhone.

- **Your phone is the primary store.** Everything lives in IndexedDB and works offline.
- **Optional backup** to Supabase: one JSON snapshot per user. In v1 the backup is _not_ encrypted.
- **No analytics, tracking or third-party requests.** Supabase is the only network call.
- **Not medical advice.** Ovulation and fertile-window estimates are _not_ reliable for contraception.

See [SPEC.md](SPEC.md) for the full build spec.

## Tech stack

TypeScript (strict) · React · Vite · vite-plugin-pwa · Dexie (IndexedDB) · date-fns · Supabase · Vitest

## Local development

Requires Node 20+.

```bash
npm install
npm run dev          # dev server at http://localhost:5173/rouge/
npm test             # run the engine tests once
npm run test:watch   # run the tests in watch mode
npm run lint         # ESLint
npm run format       # Prettier (write); use format:check in CI
npm run typecheck    # tsc, no emit
npm run build        # typecheck + production build
```

## Project structure

```
src/
  engine/       pure prediction logic + *.test.ts (no React, no Dexie, no clock)
  db/           Dexie schema, queries, hooks
  lib/          Supabase client, backup, today(), export/import
  screens/      Today, Calendar, Insights, Settings, Onboarding
  components/   DayEditor, CalendarMonth, TabBar, charts
  content/      messages.json
  styles/       tokens.css (design tokens), global.css
public/         icons
.github/workflows/  deploy.yml
```

Design tokens (colours, type, spacing, radii) all live in `src/styles/tokens.css`.

## Environment variables

Copy `.env.example` to `.env.local` (git-ignored) and fill in:

| Variable                 | Value                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Project URL, e.g. `https://abcd1234.supabase.co`                   |
| `VITE_SUPABASE_ANON_KEY` | The **public anon / publishable** key. Never the service-role key. |

Both are optional. Without them the app works normally and backup is hidden (export/import
still works). They are baked into the build at build time, so add the same values as GitHub
Actions secrets for the deployed site. The Supabase URL is also added to the Content Security
Policy automatically.

## Supabase setup

Backup is one JSON snapshot per user in a `backups` table, protected by row-level security so
each user can only read and write their own row. Sign-in is by **6-digit email code** (not magic
links: a link would open in Safari rather than the installed app).

1. Create a project at [supabase.com](https://supabase.com) in the **Mumbai (`ap-south-1`)**
   region.
   When creating it: leave GitHub unconnected, keep **Enable Data API** on, turn
   **Automatically expose new tables** off, and **Enable automatic RLS** on.
2. **SQL Editor** → run the SQL in [SPEC.md §9.1](SPEC.md) (table + RLS policies), followed by
   this grant (needed because new tables aren't exposed automatically; RLS still limits each
   user to their own row, and signed-out visitors get no access):

   ```sql
   grant select, insert, update, delete on public.backups to authenticated;
   ```

3. **Authentication → Sign In / Providers** → make sure **Email** is enabled.
4. **Authentication → Emails → Magic Link** template → make the email show the code, e.g.
   `<p>Your Rouge code is <strong>{{ .Token }}</strong></p>`.
5. **Project Settings → API** → copy the Project URL and anon/publishable key into `.env.local`
   and the GitHub secrets (see above).
6. If the built-in email sender's rate limit becomes a problem, set up custom SMTP under
   **Authentication → SMTP Settings**.

**How backup behaves** (`src/lib/backup.ts`, `src/components/BackupProvider.tsx`)

- When signed in and online, the app uploads a snapshot ~10 seconds after the last change, and
  again when the phone comes back online.
- It only uploads automatically when that can't overwrite anything unseen: there's no backup
  yet, or the backup is exactly what this phone last synced. Otherwise it asks:
  - **Backup found** (empty phone, e.g. a new phone): restore it?
  - **Both differ** (e.g. used on two phones): keep this phone's data, or use the backup.
- Restoring replaces local data in a single IndexedDB transaction.
- **Delete my backup** removes the row and signs out (so it isn't immediately re-created).
  Deleting the account itself needs an Edge Function and is planned for v2.
- In v1 backups are **not encrypted**; the app owner can read them. Encryption is planned for v2.

## Deploying to GitHub Pages

The app is served at `https://<github-user>.github.io/rouge/`. The base path is set by `BASE` in
`vite.config.ts`; change it if the repository is renamed.

**One-time setup**

1. The repository must be **public** (GitHub Pages on a free account), or use a paid plan.
2. In the repository on GitHub: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
3. (Milestone 8) Add the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   under **Settings → Secrets and variables → Actions**. Without them the app still works;
   backup is simply unavailable.

**Every deploy**

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs lint, the format check,
the tests and the build, then publishes `dist/`. If any step fails, nothing is deployed. Follow
progress in the repository's **Actions** tab. You can also run it by hand from there
(**Deploy to GitHub Pages → Run workflow**).

To check a production build locally: `npm run build && npm run preview`, then open
`http://localhost:4173/rouge/`.

**Offline and updates.** A service worker (vite-plugin-pwa) precaches the whole app, so it works
fully offline after the first visit. New versions install in the background and take effect the
next time the app is opened.

**Security.** Production builds include a Content Security Policy that allows only the app's own
origin plus the Supabase project URL (if set). There are no other network requests.

## Installing on iPhone

1. Open the app's URL in **Safari**.
2. Tap **Share** (the square with an arrow) → **Add to Home Screen** → **Add**.
3. From then on, open Rouge **from the Home Screen icon**.

The Home Screen app has **separate storage from Safari**: anything logged in a Safari tab won't
appear in the installed app (and vice versa). Install first, then go through onboarding inside
the installed app. The app shows this guide on the welcome screen when opened in Safari on an
iPhone, and in Settings.
