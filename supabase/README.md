# Supabase migrations

Versioned schema for betfluencer. Migrations live in `supabase/migrations/` and run in timestamp order.

| File | What |
|---|---|
| `20260610000001_init.sql` | Baseline — all current tables, indexes, the auto-tick trigger, `tipster_rankings` view, seed data. |
| `20260610000002_transactions.sql` | `transactions` table (ioTec Pay) + `updated_at` trigger + RLS. |
| `20260610000003_lock_pending_content.sql` | RLS hardening — only paid buyers (via the service-role API) can read pending booking codes; anon can read only finished slips; no anon writes (can't forge a purchase). |

> `src/lib/schema.sql` is kept as a single full-schema reference; the migrations are the source of truth going forward.

## Three ways to apply them

### 1. Supabase CLI — linked project (recommended)
```bash
npx supabase login
npm run db:link -- --project-ref <your-project-ref>   # ref from the Supabase dashboard URL
npm run db:push                                        # applies all pending migrations
```
Create a new migration later: `npm run db:new <name>` → edit the generated file → `npm run db:push`.

### 2. Local stack (for development)
```bash
npx supabase start      # spins up local Postgres + studio (Docker)
npm run db:reset        # drops + re-applies every migration locally
```

### 3. Manual — SQL editor or psql
Run each file in `supabase/migrations/` **in order** via the dashboard SQL Editor, or:
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260610000002_transactions.sql
```

## Existing live project
The live DB already has the `0001_init` objects. So on the current project, apply **`0002_transactions`** then **`0003_lock_pending_content`** (the latter is a security fix — without it the public anon key can read pending booking codes directly):
- Quickest: paste `20260610000002_transactions.sql` then `20260610000003_lock_pending_content.sql` into the dashboard SQL Editor and run them in order.
- CLI: mark the baseline as already applied first, then push —
  ```bash
  npx supabase migration repair --status applied 20260610000001
  npm run db:push
  ```

Scripts (in `package.json`): `db:new`, `db:push` (alias `migrate`), `db:reset`, `db:diff`, `db:link`.
