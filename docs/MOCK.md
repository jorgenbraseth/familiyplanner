# Mock stack and screenshots

Every page can be rendered locally against a made-up family, with the app's real Supabase queries running on a
throwaway Postgres with the real migrations and real RLS. Nothing external is called.

```bash
npm run mock                      # Postgres + mock Supabase gateway + `next dev` (Ctrl+C stops everything)
npm run mock -- --prod            # next build && next start instead (build needs Google Fonts reachable; untested offline)
npm run shot -- --as Emma --path / --viewport phone --out .mock/shots/emma-home.png [--full-page]
npm run shot -- --as Kari --path /skjerm?person=<id> --viewport tablet --screen
npm run shot -- --config scripts/mock/shots.example.json
node scripts/mock/session.mjs --as Emma [--session-id <uuid>]     # prints the auth cookie
```

`shot` reuses a running stack (`.mock/state.json`) or starts one for the run and stops it afterwards. Options: `--as`
(seeded first name or email), `--path`, `--viewport` (`phone` 390x844, `tablet` 1180x820, `tablet-portrait` 820x1180,
`desktop` 1440x900, or `WxH`), `--out`, `--full-page`, `--wait-for <selector>`, `--click <selector>[;;<selector>]` (clicked in order before the shot, e.g. to open a dialog), `--session-id`, `--screen` (registers
the JWT's session in `screen_sessions` so the parent session acts as Familieskjerm), `--scale`, `--now <ISO date-time>` (the app's clock for the shot, e.g. `2026-10-28T07:30:00+01:00`: a `mock_now` cookie read by `getNow()` in `src/lib/now.ts`, honoured only in the mock stack; the seed's dates follow the real today, so pick a weekday of the current week for school views). Output defaults to
`.mock/shots/`; logs are `.mock/gateway.log` (unsupported queries are logged there loudly) and `.mock/next.log`.

## Parts

- `supabase/mock/stubs.sql` (Supabase stubs; `auth.*` read `request.jwt.claims`), `supabase/mock/seed.sql` (Kari and
  Ola parents; Emma 10 and Jonas 7 children; all dates relative to today in Europe/Copenhagen; fixed ids).
- `scripts/mock/rest.mjs` + `query.mjs`: mini PostgREST (select with embeds, filters, or/not, order, limit/offset,
  count, single object, insert/upsert/update/delete, rpc). One transaction per request with
  `set local role` + `request.jwt.claims`; errors carry the SQLSTATE in `code`.
- `scripts/mock/gateway.mjs`: `/rest/v1`, `/auth/v1` (user, token, logout, jwks), `/storage/v1` (signed URLs and
  generated avatar SVGs, PDF, PNG).
- `scripts/mock/session.mjs`: dev-only HS256 JWTs and the `sb-<host>-auth-token` cookie.
- `src/lib/calendar/mock-events.ts`: made-up Google events, used when `MOCK_MODE=1` and `VERCEL_ENV` is not production.

Limits: it is "today", so on a weekend the school views are empty; Google Fonts load from the network (fallback fonts
offline); PostgREST features not used by the app (fts, JSON path filters, `any/all` quantifiers, other schemas)
return 400 `MOCK_UNSUPPORTED`: extend `query.mjs` and its tests.
