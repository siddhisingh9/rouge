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

_TODO (Milestone 8)._ Copy `.env.example` to `.env.local`. Use only the **public anon/publishable** key, never the service-role key.

## Supabase setup

_TODO (Milestone 8)._

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
