# CLAUDE.md – Family Planner

Private family web app at https://planner.braseth.family. Read `docs/PLAN.md` (what to build) and `docs/SETUP.md` (accounts, secrets, deploy) before starting work.

## Current status

Phase 0 scaffold is in the repo; the Vercel project, env vars and the `planner.braseth.family` domain are set up by hand (docs/SETUP.md). Phase 1 is live (Google login + allowlist, members admin, calendar views). Phase 2 is live (upload, Claude extraction, review/publish, child views, sign-up hook); extraction works on real plans. **To revisit later (owner):** the document review page and the children's school views are hard to use and read; give them a usability/readability pass. Phase 3 is live and owner-tested (star tracks, requests/approvals, rewards, web push, installable PWA, plus the owner-requested "Se som barn" parent preview: read-only, cookie honoured only for parent→child, shows only what the child would see). Next step: **Phase 4**. Extra features in PLAN.md are out of scope until phases 1–4 are done.

- [x] Phase 0 – Setup (Next.js + TS + Tailwind, Supabase SSR client, migrations folder, `.env.example`, Vercel config, CI). Owner still to do: Vercel project + domain (docs/SETUP.md §5–6)
- [x] Phase 1 – Google login + allowlist, members admin, calendars
- [x] Phase 2 – Document upload, Claude extraction, parent review, child Today/Week (UI polish pending)
- [x] Phase 3 – Star tracks, approvals, rewards, web push, PWA, "Se som barn" preview
- [ ] Phase 4 – Voice assistant (`/api/assistant`, tools, speech in/out, limits, log)

Update this checklist as phases land.

## How to work (owner rule)

For every task: plan the work with Opus (the main session), then hand it off to one or more Sonnet subagents (model `sonnet`) to carry out; review their results before committing and pushing.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS, deployed on Vercel (EU region)
- Supabase (EU): Postgres with RLS, Storage (private bucket `documents`), Auth with the Google provider, via `@supabase/ssr`
- Claude API via `@anthropic-ai/sdk`; model names come from `ANTHROPIC_MODEL_EXTRACT` / `ANTHROPIC_MODEL_ASSISTANT`
- Google Calendar REST with a service account (`google-auth-library`)
- Web Push (`web-push`, VAPID)
- Vitest for unit tests

## Layout

- `src/app/` – routes (App Router). `src/proxy.ts` – Next 16's renamed middleware; refreshes the Supabase session.
- `src/lib/supabase/` – `server.ts` (user-scoped, default), `client.ts` (browser), `admin.ts` (service role, rare), `proxy.ts`.
- `src/lib/i18n.ts` – all UI strings. `src/lib/dates.ts` – Copenhagen time + ISO weeks.
- `supabase/migrations/` – SQL migrations, deployed by `.github/workflows/supabase.yml` on merge to `main`; `supabase/tests/run.sh` checks them and the RLS policies on a throwaway Postgres (also in CI). Unit tests sit next to the code as `*.test.ts`.
- Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API (see AGENTS.md). Cache Components is off on purpose (every page depends on the signed-in member).

## Rules

- **Secrets are server-only.** `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `VAPID_PRIVATE_KEY` are read only in server code (`import "server-only"` in those modules). Never prefix them with `NEXT_PUBLIC_`.
- **Authorization lives in the database.** Every table has RLS enabled; policies use `current_member_id()` and `is_parent()`. App code uses the user-scoped Supabase client by default. Use the service-role client only where RLS can't apply (sending push to another member, allowlist check before a session exists) and keep those call sites few and obvious.
- **The voice assistant's tools run as the signed-in user** (user-scoped client), so RLS limits what Claude can read. Don't widen this with the service-role client.
- **Allowlist:** a signed-in Google user whose email isn't in `members` is signed out and shown a "not invited" page. Compare emails lowercased.
- **Children's data:** no real PDFs, photos or calendar data in git, fixtures or logs. Use made-up test data.
- **Uploads go browser → Supabase Storage directly**, then a server action processes the file (avoids body-size limits). Path: `<member_id>/<document_id>.<ext>`.
- **Claude extraction** uses structured outputs (`client.messages.parse` + `zodOutputFormat`, `src/lib/extraction/`); forced `tool_choice` is rejected by current models (Sonnet 5.5). Validate and normalize the result before writing `plan_items`. Documents go to `review` status; only parents publish.
- **Schema changes** are new files in `supabase/migrations/` (never edit an applied migration).
- **UI strings** live in one module (e.g. `src/lib/i18n.ts`) so the language (Norwegian/Danish) can be switched in one place. Dates/times in `Europe/Copenhagen`, weeks are ISO weeks.
- Mobile first: kids use phones; parents approve stars from their phone.

## Commands

```bash
npm run dev        # local dev on :3000
npm run lint
npm run typecheck  # next typegen && tsc --noEmit
npm test           # vitest
npm run build
```

Run lint, typecheck and tests before committing (and `bash supabase/tests/run.sh` when migrations change).
