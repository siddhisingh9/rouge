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
npm run dev          # start the dev server
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

_TODO (Milestone 7)._

## Installing on iPhone

_TODO (Milestone 7)._ In Safari, tap Share → Add to Home Screen. Always open the app from the Home Screen icon, because it has separate storage from Safari.
