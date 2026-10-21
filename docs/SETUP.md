# Setup guide (accounts and secrets)

Everything here is done once, by hand, in web consoles. Secrets go into **Vercel environment variables** and a local `.env.local` — never into git or chat.

Order: 1 Claude API → 2 Supabase → 3 Google Cloud → 4 Supabase Auth → 5 Vercel → 6 Cloudflare DNS → 7 first members.

---

## 1. Claude API (Anthropic Console)

Your Claude.ai subscription does **not** cover API calls from apps you build. The API is a separate pay-as-you-go account.

1. Go to **https://platform.claude.com** and sign in.
2. **Billing:** add a payment method and buy a small amount of credit (5–10 USD lasts a long time for one family).
3. **Settings → Workspaces → Create workspace** named `family-planner`. (Spend limits can't be set on the Default workspace, so a separate one matters.)
4. In that workspace, open **Spend limits** and set a monthly cap, e.g. **10 USD**. When the cap is hit, API calls stop until the 1st of next month (00:00 UTC), so a bug can never cost more than this.
5. Optional: under organization **Billing → Spend limits**, set an org-wide cap and an email alert at e.g. 50 %.
6. In the `family-planner` workspace, **create an API key** named `vercel-production`. Copy it once.
   - Put it in Vercel as `ANTHROPIC_API_KEY` (step 5).
   - For local development, create a second key `local-dev` and put it in `.env.local`. Separate keys make it easy to revoke one.
7. The key is used **only on the server** (server actions / route handlers). It must never be imported into a client component or prefixed with `NEXT_PUBLIC_`.

Models (env vars, easy to change):

- `ANTHROPIC_MODEL_EXTRACT=claude-sonnet-5-5` – reading school PDFs/photos
- `ANTHROPIC_MODEL_ASSISTANT=claude-haiku-5-5` – fast voice answers

Check current model names and prices at https://docs.claude.com before going live.

## 2. Supabase project

1. Create a new project, region **EU** (e.g. Frankfurt or Stockholm). Save the database password in your password manager.
2. **Project Settings → API:** copy
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (server only; used for push notifications and admin tasks, never in the browser)
3. Migrations live in `supabase/migrations/` and are applied with the Supabase CLI (`supabase link` then `supabase db push`) or pasted into the SQL editor.

## 3. Google Cloud

Create one project, e.g. `family-planner`.

**A. OAuth client (for "Sign in with Google")**

The consent screen now lives in **Google Auth Platform** (menu → APIs & Services → OAuth consent screen opens it).

1. **Get started:** app name "Familieplanlegger", user support email = yours, audience **External**, contact email = yours, accept the policy → **Create**.
2. **Scopes: nothing to do.** `openid`, `email` and `profile` are non-sensitive and Supabase requests them itself, so the **Data Access** page can stay empty (if you want them listed: Data Access → Add or remove scopes → tick `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` → Save). Don't add any other scopes; those can trigger Google verification.
3. **Audience → Publish app** (status **In production**). With only the basic scopes no verification is needed, and in "Testing" only listed test users could sign in. The app's own allowlist decides who gets in.
4. **Clients → Create client → Web application** (same as Credentials → Create credentials → OAuth client ID).
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in Supabase under Auth → Providers → Google).
5. Copy the **Client ID** and **Client secret** → paste them into Supabase (step 4). They don't go into Vercel.

**B. Service account (for reading calendars)**

1. **APIs & Services → Library → Google Calendar API → Enable.**
2. **IAM & Admin → Service accounts → Create**, name `calendar-reader`, no roles needed.
3. Open it → **Keys → Add key → JSON.** Download the file.
4. Base64-encode it into one line and store it as `GOOGLE_SERVICE_ACCOUNT_KEY`:
   - macOS/Linux: `base64 -i key.json | tr -d '\n'`
   - Windows (PowerShell, in the folder with the file): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\key.json")) | Set-Clipboard` (copies the result to the clipboard)
   Then delete the downloaded file.
5. Note the service account's email (`calendar-reader@<project>.iam.gserviceaccount.com`).
6. **Each family member** (or you, for the kids' accounts): Google Calendar → the calendar's **Settings and sharing → Share with specific people → add the service account email → "See all event details".**
7. The calendar ID is under **Integrate calendar** on the same page; for a primary calendar it's the Gmail address.

**C. Text-to-Speech (assistant read-aloud)**

The voice assistant reads answers aloud with Google Cloud Text-to-Speech, using the same `GOOGLE_SERVICE_ACCOUNT_KEY`. In the Google Cloud project that owns the service account: **APIs & Services → Library → Cloud Text-to-Speech API → Enable** (billing must be enabled on the project; the free tier covers normal family use). Optional env vars: `GOOGLE_TTS_VOICE` (default `nb-NO-Wavenet-F`; a wrong name falls back to any `nb-NO` voice) and `GOOGLE_TTS_SPEAKING_RATE` (default `1.0`, clamped 0.5–1.5). If the API or key is missing, the app falls back to the device's own voice.

## 4. Supabase Auth

1. **Authentication → Providers → Google:** enable, paste Client ID + secret from 3A.
2. **Authentication → URL configuration:**
   - Site URL: `https://planner.braseth.family`
   - Redirect URLs: `https://planner.braseth.family/**` and `http://localhost:3000/**`
3. Keep **Authentication → Sign In / Providers → "Allow new users to sign up" ON**. Every family member's first Google sign-in creates their Supabase user, so turning it off blocks them with `signup_disabled`. The `members` allowlist decides who gets in. To stop email/password logins, turn off the **Email** provider instead.

**Sign-up allowlist hook (optional, recommended).** After the migrations are deployed (section 8), go to **Authentication → Hooks → "Before User Created"**, choose the **Postgres** function type (the dashboard may label it "SQL"), schema `public`, function `hook_before_user_created`, and enable it. Strangers are then rejected with `not_invited` before Supabase creates a user for them, and the app shows the "not invited" page. It can stay off safely: the app's own allowlist check still signs strangers out, they just get a Supabase user row first. The function is created by migration `20261022090100_signup_allowlist_hook.sql` and reads `public.members` as `supabase_auth_admin`.

**Family Link (kids' accounts).** The kids use Google accounts supervised with Family Link. The first time a child signs in, a parent may have to allow the app in the Family Link app (the child's settings, under the controls for their Google account / sign-in with Google), and children under 13 may see a "ask your parent" approval screen. Exact menus differ by version, so test this on the first sign-in and approve from the parent's phone if it asks.

## 5. Vercel

1. **Add New → Project →** import `jorgenbraseth/familiyplanner`. Framework: Next.js.
2. Project settings → **Functions → Region:** an EU region (e.g. `fra1` Frankfurt or `arn1` Stockholm), close to the Supabase region.
3. **Environment Variables** (Production and Preview) — see `.env.example` for the full list:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_EXTRACT`, `ANTHROPIC_MODEL_ASSISTANT`
   - `GOOGLE_SERVICE_ACCOUNT_KEY` (and optionally `GOOGLE_TTS_VOICE`, `GOOGLE_TTS_SPEAKING_RATE`)
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate with `npx web-push generate-vapid-keys`; subject `mailto:jorgen.braseth@gmail.com`)
   - `NEXT_PUBLIC_SITE_URL=https://planner.braseth.family`
4. **Settings → Domains → Add** `planner.braseth.family`. Vercel shows the DNS record it wants (normally a CNAME to `cname.vercel-dns.com`, or a project-specific target — use exactly what Vercel shows).

## 6. Cloudflare DNS

1. Cloudflare dashboard → `braseth.family` → **DNS → Records → Add record**
   - Type `CNAME`, Name `planner`, Target = the value Vercel showed.
   - **Proxy status: DNS only (grey cloud).** Vercel issues the SSL certificate itself; the orange-cloud proxy interferes with that.
2. Wait for Vercel's domain page to show "Valid configuration" (usually minutes).
3. Optional later: **Email Routing** for addresses like `hjem@braseth.family` (free).

## 7. First members

Once the database is migrated (section 8), run `supabase/seed.sql` once in the Supabase SQL editor. It adds you as the first parent:

```sql
insert into public.members (name, email, role, calendar_id, colour, locale)
values ('Jørgen', 'jorgen.braseth@gmail.com', 'parent', 'jorgen.braseth@gmail.com', '#2563eb', 'nb-NO');
```

Everyone else can then be added from the app's members page.

## 8. Database migrations (GitHub Actions)

The workflow `.github/workflows/supabase.yml` ("Supabase migrations") runs `supabase db push` when `supabase/migrations/**` changes on `main`. It never runs the seed. Add three repo secrets (GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → **Account → Access Tokens** → create a **scoped** token, limited to this project, with **Read** on *Project Settings*, *API Keys*, *API Key Secrets* and *Connection Pooling* (what `supabase link` needs; without *Connection Pooling* it can't set up the IPv4 pooler connection and `db push` fails with "IPv6 is not supported on your current network", since GitHub runners have no IPv6; `db push` itself uses the database password, not the token). Access can't be edited later: delete and recreate the token to change it. |
| `SUPABASE_PROJECT_ID` | the project ref: the `xxxx` in `https://xxxx.supabase.co`, also **Project Settings → General** |
| `SUPABASE_DB_PASSWORD` | the database password from step 2.1 (lost it? reset under **Project Settings → Database**) |

Until the secrets exist the workflow skips with a notice instead of failing.

1. The first run happens when a migration lands on `main`, or start it by hand: **Actions → "Supabase migrations" → Run workflow**.
2. Afterwards run `supabase/seed.sql` once in the SQL editor to add the first parent (section 7).

The private `documents` storage bucket (and its access policies) is created by the migrations too, so there is nothing to set up under **Storage**.

Manual alternative: paste each file from `supabase/migrations/` (oldest first) into the SQL editor and run it.

---

## Local development

```bash
cp .env.example .env.local   # fill in values (use the local-dev Anthropic key)
npm install
npm run dev                  # http://localhost:3000
```

## Push notifications

- The VAPID variables (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) must be set in Vercel (step 5.3). Without them the app works, but no push is sent.
- On iPhone, push only works after the app is added to the Home Screen: Safari → Del → **Legg til på Hjem-skjerm**, then open it from there.
- Each person turns on **Varsler** on their own phone (Meg page, "Varsler" card). Subscriptions are per device.
- The PNG icons in `public/icons/` come from `tools/make-icons.mjs` (needs `sharp`, which Next.js already installs; run `node tools/make-icons.mjs`).
