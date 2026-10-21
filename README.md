# Family Planner

Private family web app at **https://planner.braseth.family**: Google sign-in, everyone's calendars, weekly school schedules and homework, star tracks with parent approval, and a voice assistant powered by Claude.

- [docs/PLAN.md](docs/PLAN.md) – features, architecture, data model, build phases
- [docs/SETUP.md](docs/SETUP.md) – Claude API, Supabase, Google Cloud, Vercel and Cloudflare setup
- [CLAUDE.md](CLAUDE.md) – working notes for Claude Code

## Development

Node 22+.

```bash
cp .env.example .env.local   # fill in values; the app starts without them
npm install
npm run dev                  # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```
