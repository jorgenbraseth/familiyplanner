# Family Planner – Solution Plan

A private family web app at **https://planner.braseth.family**. Each family member signs in with their own Google account. The app brings four things into one place:

1. Everyone's Google Calendar, side by side
2. Weekly school schedules and homework (PDFs a parent uploads)
3. Star tracks with parent approval (small reward every 5 stars, big reward at 30)
4. A voice button that lets anyone ask Claude about their own week

Extra features (kitchen-tablet view, chores, shopping list, etc.) are **out of scope for now**; see the bottom of this file.

---

## Decisions

| Topic | Decision |
| --- | --- |
| URL | `planner.braseth.family` (subdomain; `braseth.family` stays free) |
| DNS | Cloudflare, CNAME `planner` → Vercel, **DNS only** (grey cloud) |
| Hosting | Vercel (Next.js) |
| Database, files, auth | Supabase, **EU region** |
| Login | Supabase Auth with the Google provider + an allowlist (`members` table) |
| Calendars | Google Calendar API via one service account that each member shares their calendar with |
| AI | Claude API (Anthropic Console, separate pay-as-you-go key, workspace spend limit) |
| Voice | Browser speech recognition + speech synthesis; push-to-talk, no wake word |
| App type | Installable PWA (add to home screen); no app store |

**Why Supabase Auth instead of Auth.js:** the signed-in user's email is then available inside Postgres, so row-level security (RLS) can enforce "a child only sees their own data" in the database itself. The voice assistant's tools run as the signed-in user, so RLS also limits what Claude can see.

---

## Roles

Only emails in the `members` table can use the app. Anyone else is signed out after the Google screen.

| Role | Can do |
| --- | --- |
| Parent | See all calendars, upload/delete documents for any child, create/edit star tracks, approve/decline stars, give stars directly, mark rewards given, manage members, read the assistant log |
| Child | See all calendars, see their own documents and plan items, tick homework done, request stars on their own tracks, use the voice assistant about their own data |

Note: if the kids use supervised (Family Link) Google accounts, Google may block sign-in to third-party apps until a parent allows it. Test this on day one.

---

## Feature 1: Family calendars

- Home screen: **Today** and **This week** for the signed-in person.
- **Family** view: one column per person (or a merged list with coloured dots), toggle chips to show/hide each person.
- Each member row stores `calendar_ids` (a list of Google calendar ids, usually their Gmail address plus any shared calendars) and a colour.
- Server reads events with a Google **service account** (`GOOGLE_SERVICE_ACCOUNT_KEY`), using `events.list` with `singleEvents=true`, `orderBy=startTime`. Cache results ~5 minutes.
- Read-only for now. Adding events from the app would require per-user calendar consent; later phase if wanted.

## Feature 2: Timeplan, ukeplan and homework

Two document types:

- **Timeplan** (`timeplan`, no ISO week): one child's fixed weekly timetable. Extraction gives, per weekday (Mon-Fri; Sat/Sun only if present), school start/end and every period (period number if given, start/end, subject), stored in `timetable_days` / `timetable_periods`. Once the parent publishes it, it is the child's school-day configuration; the latest published timeplan wins (`active_timeplan_document(member)`). The review page shows "Erstatter forrige timeplan" when the child already has a published one.
- **Ukeplan** (`ukeplan`, ISO week + year required): the week's homework, events and messages in `plan_items`. No lessons come from an ukeplan any more. Kinds: `homework` (a specific day, or the whole week: `whole_week = true`, date = the Monday), `event` (important events, optional start/end time, shown in calendars), `message` (important messages and things to remember or bring; day-specific or whole week). Every item has an `audience`: `child` (things the child must do/bring/know), `parent` (addressed to parents: meetings, forms to sign, payments), `both` (general info). Homework is `child` unless clearly for parents. Children never see `parent` items (RLS).

Upload flow:

1. Parent uploads a PDF (or a phone photo) and picks child and type (default ukeplan); a ukeplan also gets ISO week + year, a timeplan does not.
2. The browser uploads straight to the private Supabase Storage bucket `documents`, path `<member_id>/<document_id>.<ext>` (avoids Next.js body-size limits).
3. A server action sends the file to Claude with a type-specific prompt and schema (structured outputs, `src/lib/extraction/`: `extractTimeplan` / `extractUkeplan`); results are validated and normalized (HH:MM times, weekday 1-7, period 1-15, dates within the week, +7 days for homework and events).
4. The rows go into `timetable_days`/`timetable_periods` (timeplan) or `plan_items` (ukeplan) with the document in status `review`. The parent sees them beside the PDF: a weekday grid with editable start/end and periods (timeplan), or "Hele uken" plus one section per day with editable kind, day, audience and event time (ukeplan). Then **Publish** (parents only).
5. A published ukeplan notifies the child; a published timeplan simply becomes the active timetable.

Child sees: **Today** (school day from the timetable, homework due tomorrow, events, messages), **This week**, and the original file one tap away. The file is the source of truth; extracted items are a convenience.

## Feature 3: Star tracks and rewards

A star track: child, name, goal (default 30), milestone interval (default 5), small-reward text, big-reward text, preset reasons (e.g. "Ryddet rommet").

Flow:

1. Child taps **Add a star**, picks a preset reason or types one, optionally attaches a photo.
2. Star is `pending` (outlined); parents get a push notification.
3. Parent approves (filled star) or declines with a note. Parents can also give an approved star directly.
4. Every 5th approved star → celebration + small reward; parent sees **Reward owed** until marked given.
5. At 30 → big reward; parent can complete the track and start a new one (old one kept as history).

Rules: max N star requests per child per day (default 5), parent can undo, full history.

## Feature 4: Voice assistant with Claude

- Mic button (push-to-talk) on every screen, with a text box fallback.
- Speech → text in the browser (`SpeechRecognition` / `webkitSpeechRecognition`), language always `nb-NO` (Norwegian bokmål; every family member is Norwegian).
- `POST /api/assistant` → Claude with the member's name, the family list (names, roles), today's date and a short kid-friendly system prompt. Always answers in Norwegian bokmål.
- Claude can call tools that run **as the signed-in user** (so RLS applies):
  - Every tool takes `member_name`: any family member's first name or id, `children`, `everyone`, or null for the person asking. Anyone in the family may ask about anyone else.
  - `get_plan_items(from, to, kind?, member_name)` – homework, events, messages and school days
  - `get_timetable(from, to, subject?, member_name)` – school hours and lessons (e.g. which kids have maths tomorrow)
  - `get_calendar(from, to, member_name)` – calendar events
  - `get_stars(member_name)` – active track, approved/pending counts, goal, next milestone and reward
- Answer shown on screen and read aloud with `speechSynthesis`.
- Guardrails: data access enforced by RLS (not the prompt); short, age-appropriate answers; help plan homework but don't do it; daily question limit per child (default 30); every Q&A stored in `assistant_log` for parents.
- Models: a fast, cheap model for voice (`claude-haiku-5-5`), a stronger one for document extraction (`claude-sonnet-5-5`). Keep both in env vars so they can be swapped. Verify current model names at https://docs.claude.com before building.

---

## Architecture

```
Phone / tablet (PWA)
   │  mic → text, text → speech
   ▼
Next.js on Vercel (planner.braseth.family)
   ├─ Supabase Auth (Google) + members allowlist ──► Google sign-in
   ├─ Calendars (service account) ────────────────► Google Calendar API
   ├─ Star tracks + approvals
   ├─ Document upload + extraction ───────────────► Claude API
   └─ Voice assistant + tools ────────────────────► Claude API
   │
   ▼
Supabase (EU): Postgres + RLS, Storage (private bucket), Auth
```

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Supabase client | `@supabase/ssr` (cookies-based session, server components + server actions) |
| AI | `@anthropic-ai/sdk` (server only) |
| Google | `google-auth-library` (service-account JWT) + Calendar REST |
| Push | Web Push with VAPID keys (`web-push`), service worker |
| Tests | Vitest for pure logic (milestones, date/week helpers, extraction parsing) |

---

## Data model

All child-owned rows carry `member_id`. RLS helper functions: `current_member_id()` (by `auth.email()`), `is_parent()`.

| Table | Key fields | Notes |
| --- | --- | --- |
| `members` | id, name, email (unique, lowercase), role (`parent`/`child`), calendar_ids, colour, locale | The allowlist |
| `documents` | id, member_id, type (`timeplan`/`ukeplan`), iso_week, iso_year (null for a timeplan), file_path, mime_type, status (`processing`/`review`/`published`/`failed`), error, uploaded_by, created_at | File in Storage |
| `plan_items` | id, document_id, member_id, date, kind (`homework`/`event`/`message`; `lesson` legacy only), subject, text, audience (`child`/`parent`/`both`), whole_week, starts_at/ends_at (events), done, sort | Extracted from an ukeplan, editable |
| `timetable_days` | id, document_id, member_id, weekday (1-7), starts_at, ends_at | School hours per weekday, from a timeplan |
| `timetable_periods` | id, document_id, member_id, weekday, period (1-15 or null), starts_at, ends_at, subject, sort | Periods, from a timeplan, editable |
| `star_tracks` | id, member_id, name, goal, milestone_every, small_reward, big_reward, preset_reasons text[], status (`active`/`completed`), created_at | One active per child |
| `stars` | id, track_id, member_id, reason, photo_path, status (`pending`/`approved`/`declined`), requested_by, decided_by, decided_at, note, created_at | Only approved count |
| `rewards` | id, track_id, at_count, kind (`small`/`big`), given_at, given_by | A row = reward handed out; "owed" = milestones reached without a row |
| `assistant_log` | id, member_id, question, answer, created_at | Review + limits |
| `push_subscriptions` | id, member_id, endpoint, keys jsonb, created_at | Web push |

RLS summary:

- `members`: everyone signed in and allowlisted can read; parents write.
- `documents`, `plan_items`, `star_tracks`, `stars`, `rewards`, `assistant_log`: parents full access. Children read the whole family's school, star and routine data (published documents and their child/both plan items, timetables, tracks, stars, rewards, tasks, routines), but never parent-audience items, documents in review, files, `assistant_log` of others or push subscriptions. Child-facing app queries therefore filter on `member_id` explicitly.
- Children may update only `plan_items.done` on their own rows, and insert `stars` with `status = 'pending'` on their own active track.
- Storage bucket `documents` (private): parents full access; children read objects under `<their member_id>/`.

---

## Build plan

| Phase | What ships | Done when |
| --- | --- | --- |
| 0. Setup | Next.js app, Tailwind, Supabase client, migrations folder, env vars, Vercel project, `planner.braseth.family` live | Empty app loads on the domain |
| 1. Login + calendars | Google sign-in, allowlist check, members admin (parent), calendar views (me / family) | Everyone can sign in on their phone and see all calendars |
| 2. Schedules + homework | Upload, Storage, Claude extraction, parent review + publish, child Today/Week views | A real school plan uploads and shows as today's homework |
| 3. Star tracks | Tracks, requests, approvals, milestones, rewards owed/given, push notifications, PWA install | Child requests a star, parent approves from phone |
| 4. Voice assistant | Mic button, text fallback, `/api/assistant` with tools, read-aloud, limits, log | "Hva er leksene mine i dag?" gets a correct spoken answer |

Before phase 1:

- [ ] Decide UI language (decided: Norwegian bokmål only). Keep all UI strings in one file so this is easy to change.
- [ ] Check whether the kids' Google accounts are supervised by Family Link.
- [ ] Collect one sample school plan PDF per child to test extraction (keep them out of git).

---

## Costs (approximate, verify before launch)

| Item | Monthly |
| --- | --- |
| Vercel Hobby | Free |
| Supabase free tier | Free (free projects pause after a period of inactivity) |
| Google Calendar API | Free |
| Claude API (≈10 documents/week + voice) | ~2–10 USD, hard cap via workspace spend limit |
| Domain | Already owned |

## Risks

- **Children's personal data:** keep Storage private, allowlist strict, EU regions, no PDFs in git or logs.
- **Family Link** may block kids' sign-in until allowed.
- **Extraction mistakes:** parent review step before publishing.
- **Browser speech recognition** varies by browser; keep the text fallback.

## Open questions

- How many children and what ages? (Picture-based UI for small kids vs text for older.)
- Should kids see siblings' star tracks, or only their own? (Default: own only.)

## Later / extra features (not now)

Recurring chores that earn stars · kitchen-tablet family view · morning/evening checklists · shared shopping list (with voice) · weekly digest · photo proof for stars · meal plan · wishlist for rewards · family message board · forward school emails for extraction.
