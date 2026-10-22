# CLAUDE.md – Family Planner

Private family web app at https://planner.braseth.family. Read `docs/PLAN.md` (what to build) and `docs/SETUP.md` (accounts, secrets, deploy) before starting work.

## Current status

Phase 0 scaffold is in the repo; the Vercel project, env vars and the `planner.braseth.family` domain are set up by hand (docs/SETUP.md). Phase 1 is live (Google login + allowlist, members admin, calendar views). Phase 2 is live (upload, Claude extraction, review/publish, child views, sign-up hook); extraction works on real plans. **To revisit later (owner):** the document review page and the children's school views are hard to use and read; give them a usability/readability pass. Phase 3 is live and owner-tested (star tracks, requests/approvals, rewards, web push, installable PWA, plus the owner-requested "Se som barn" parent preview: read-only, cookie honoured only for parent→child, shows only what the child would see). Phase 4 code is written (voice assistant: `/api/assistant` runs Claude with tools on the user-scoped client, push-to-talk + text fallback, read-aloud via Google Cloud TTS (`/api/tts`, service account; device voice as fallback), 30 questions/day for children in `public.assistant_daily_limit()`, parents' log at /assistant-log; family-wide questions: every tool takes a `member_name` (a first name, "children" or "everyone") and anyone may ask about anyone, with reads opened by RLS; answers and speech are Norwegian bokmål only, `nb-NO`); it is done once "Hva er leksene mine i dag?" gets a correct spoken answer. Owner-requested additions since: star tasks with star values (no daily star limit; tasks and routines are independent of star tracks: a task is for one child or for all children (`star_tasks.member_id` null) and always applies to the child's active track, managed on /stars/tasks; routines are per child and their star task is the child's own or an all-children task), weekly-plan school hours and periods, kids' start page (name, stars, Morgenstell/Kveldstell routine checklist that requests a star when done, Skoledagen, Lekser), Lekser and Ukeplan tabs, parents' home page (one-tap stars, upload ukeplan, kids' homework, school end times). Other extra features in PLAN.md are out of scope until the owner asks.

- [x] Phase 0 – Setup (Next.js + TS + Tailwind, Supabase SSR client, migrations folder, `.env.example`, Vercel config, CI). Owner still to do: Vercel project + domain (docs/SETUP.md §5–6)
- [x] Phase 1 – Google login + allowlist, members admin, calendars
- [x] Phase 2 – Document upload, Claude extraction, parent review, child Today/Week (UI polish pending)
- [x] Phase 3 – Star tracks, approvals, rewards, web push, PWA, "Se som barn" preview
- [ ] Phase 4 – Voice assistant (`/api/assistant`, tools, speech in/out, limits, log) (code written; waiting on owner test)

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

- **Wide screens use the full width:** no app-wide max width (only a generous `max-w-[120rem]` cap), content flows into columns (`md`/`lg`/`xl` grids) and mobile stays as is; forms and dialogs keep a readable width (`max-w-2xl`), running text ~75ch.
- **Secrets are server-only.** `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `VAPID_PRIVATE_KEY` are read only in server code (`import "server-only"` in those modules). Never prefix them with `NEXT_PUBLIC_`.
- **Authorization lives in the database.** Every table has RLS enabled; policies use `current_member_id()` and `is_parent()`. App code uses the user-scoped Supabase client by default. Use the service-role client only where RLS can't apply (sending push to another member, allowlist check before a session exists) and keep those call sites few and obvious.
- **The voice assistant's tools run as the signed-in user** (user-scoped client), so RLS limits what Claude can read. Don't widen this with the service-role client.
- **Family-wide reads, own writes:** every signed-in member can read the whole family's school, star and routine data and calendars (migration `20261030090000_family_wide_reads.sql`, so anyone can ask the voice assistant about anyone), but changes only their own rows. Parent-audience plan items, documents in review, the files in Storage, `assistant_log` and push subscriptions stay parent-only (or own-only). Because RLS no longer narrows a child's reads to their own rows, **every child-facing query must filter on `member_id` explicitly** (the viewed child's id for "Se som barn").
- **Profile pictures:** `members.avatar_path` → private `avatars` bucket (`<member_id>/<uuid>.webp`, 256×256, made in the browser by `src/components/avatar-editor.tsx`, saved by the `setAvatar` server action). Anyone in the family reads them; a parent changes anyone's, a member only their own (a trigger limits a child's own-row update to `avatar_path`). Pages get signed URLs in one call via `loadAvatarUrls` (`src/lib/avatar-urls.ts`); `MemberAvatar` falls back to the colour dot.
- **Several calendars per member:** `members.calendar_ids text[]` (max 10; e.g. one per kid plus a shared "both kids" calendar). `getEvents` fetches each distinct calendar once and gives a shared calendar's events to every member it belongs to; lists that mix members merge them (`mergeSharedEvents`, `EventEntry.memberIds`, the assistant's `splitSharedCalendarEvents`). The old `members.calendar_id` column is deprecated (kept for one deploy, app code never reads it; drop it in a later migration).
- **Unfinished homework carries over:** a published homework item that is not `done` stays on the list after its due date (`src/lib/homework-carry.ts`): due today or earlier, at most 14 days back (a whole-week item once its week is over), oldest first, with a muted label ("Fra mandag"). It shows at the top of the kids' Lekser (start page and /lekser), the parents' homework per child and the assistant's `unfinished_earlier_homework`; `loadSchoolWeek` fetches it in the same query (`carriedOver`, current week only). Homework always follows today, never the `?dag=` day, and the ukeplan/week views show what was due each day (no carry-over).
- **Homework/plan item text is structured:** `plan_items.text` keeps line breaks (one point per line, `- ` bullets, a heading line ending with `:`); extraction and the review form keep them (`normalizeItemText`), `StructuredText` renders them (`src/lib/item-text.ts` also recovers lists from old flat text), and titles, speech and the assistant use `flattenItemText`. Never collapse whitespace in item text or show it unformatted.
- **Allowlist:** a signed-in Google user whose email isn't in `members` is signed out and shown a "not invited" page. Compare emails lowercased.
- **Children's data:** no real PDFs, photos or calendar data in git, fixtures or logs. Use made-up test data.
- **Uploads go browser → Supabase Storage directly**, then a server action processes the file (avoids body-size limits). Path: `<member_id>/<document_id>.<ext>`.
- **Claude extraction** uses structured outputs (`client.messages.parse` + `zodOutputFormat`, `src/lib/extraction/`); forced `tool_choice` is rejected by current models (Sonnet 5.5). Validate and normalize the result before writing `plan_items`. Documents go to `review` status; only parents publish.
- **Schema changes** are new files in `supabase/migrations/` (never edit an applied migration).
- **Layout E (Luft + flater), owner-approved:** no borders, shadows or hairline dividers (`.card` is an unstyled section; `divide-y` is not used). Structure comes from whitespace (about 40-56px between sections on phones, `space-y-12` in `<main>`) and display-font section headings. Soft flat tinted blocks (`rounded-3xl`, no border, no shadow; `.panel` / `bg-chip`, `bg-warning-soft`, a member colour at ~12% via `tintStyle`/`hexToRgba` in `src/lib/colour.ts`) are only for what needs attention or is read at a glance: pending star approvals, "Skolen slutter" and stars per child, the kids' stars and current routine, timeline strips. Secondary actions are borderless text buttons (`.btn-text`, at least 44px tall), at most one or two filled primary buttons per screen; chips and toggles have no borders (selected = bold/dot). Form fields keep a visible boundary (`.field`: 1px line); the theme picker's selected tile has a ring. Modals keep a surface and rounded top, with a scrim and no border or shadow.
- **Themes:** six colour themes (Skog = default, Fjord, Godteri, K-pop, Morgengry, Orden), light only for now (no dark mode). `src/lib/themes.ts` is the single source of truth: ids, Norwegian names, fonts and every colour token; the root layout emits the CSS from it (one `:root[data-theme-name="<id>"]` rule per theme plus a bare `:root` fallback), `src/app/globals.css` only maps tokens to Tailwind colours (`@theme inline`). Never hard-code colours or add tokens in globals.css: add them to `themes.ts` for every theme (`themes.test.ts` checks every token exists and the text pairs reach WCAG 4.5:1). The theme is a per-member setting, `members.theme` (check constraint with the six ids; migration `20261103090000_member_theme.sql`, whose `members_limit_self_update` trigger lets a non-parent change only `avatar_path` and `theme` on their own row). It reaches `<html data-theme-name>` through the `theme` cookie (set by the `setTheme` server action and, on a new device, by `ThemeSync` in the (app) layout, which also sets the attribute client-side; read by the root layout and `generateViewport` for `theme-color`). "Se som barn" shows the viewed child's theme via `ThemeSync` without touching the parent's cookie. Fonts (Fraunces, Nunito, Fredoka, Lexend, Work Sans) are loaded with `next/font/google` in the root layout and picked per theme (`--theme-font-sans` / `--theme-font-display`).
- **Profile page** (`/profil`, in the top menu, hidden in "Se som barn"): the signed-in member's own settings: name/email (read-only), profile picture (`AvatarEditor`), notifications (`PushCard`, moved here from the start pages) and the theme picker.
- **UI strings** live in one module (`src/lib/i18n.ts`). The UI is Norwegian bokmål and every family member is Norwegian (owner: no Danish members), so don't add Danish variants. Dates/times in `Europe/Copenhagen`, weeks are ISO weeks.
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
