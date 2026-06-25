# DB Apply Runbook — migrations → main's prod

> **Status: NOT YET APPLIED.** Owner chose to apply the additive migrations
> **directly to main's production DB** (no staging). main-DB credentials are not
> yet available. This runbook is the exact sequence to run once they are, plus the
> inputs still required. Migrations live at `supabase/migrations/20260626000000`–`05`.

## Pre-flight inputs still needed (the deferred DB questions)
1. **main's Supabase project ref + a privileged key/connection** (service-role or
   the DB connection string) — to apply migrations and to dump `tipster_stats`.
2. **`tipster_stats` authoritative DDL** — run against prod and paste over the
   reconstruction in `20260626000000`:
   ```sql
   select pg_get_viewdef('public.tipster_stats'::regclass, true);
   ```
   (Until then the migration is a no-op on prod — prod's live view already exists
   and is preserved by the existence guard.)
3. **Tipster backfill data** (for `20260626000005`): for each existing `tipsters`
   row, a real email to create a Supabase Auth user (seeded tipsters
   `Enzo Kampala`/`Nairobi King`/`StatAttack`/`BetWise UG` have none → synthesize
   placeholders or mark display-only?).
4. **Admin identity** — the email/auth UID to promote to `profiles.role='admin'`
   (replaces main's deleted shared-password admin).

## Apply sequence (additive, non-destructive)
1. **Back up prod** (Supabase dashboard snapshot or `pg_dump`). Non-negotiable —
   apply is direct-to-prod.
2. **Enable Supabase Auth** on main's project (provisions the `auth` schema) —
   **before** `20260626000001`, whose `profiles` FK references `auth.users`.
3. **Paste the real `tipster_stats` DDL** into `20260626000000` (input #2). If you
   skip this, prod keeps its existing view (fine); only fresh DBs use the reconstruction.
4. **Adopt existing dev migrations into history without running them.** The repo
   holds dev's `20260610`–`20260625` migrations, which were applied to the *dev*
   project, NOT main's prod, and are non-idempotent (would error on prod's existing
   tables). Mark them applied so `supabase db push` won't replay them:
   ```bash
   supabase migration repair --status applied \
     20260610000001 20260610000002 20260610000003 20260610000004 \
     20260611075122 20260612120000 20260622120000 20260622130000 \
     20260623090000 20260623100000 20260625120000
   ```
   (The objects they create are instead added idempotently by `20260626000001`.)
   Consider deleting the 0-byte `20260611075122_test.sql` first.
5. **Apply the merge migrations:** `supabase db push` (runs `20260626000000`–`04`).
   Each is idempotent — safe to re-run.
6. **Backfill auth links** (`20260626000005`): create one Auth user per tipster via
   the **Auth Admin API** (cannot hand-insert `auth.users` in plain SQL), fill the
   `<<<REQUIRES INPUT>>>` UIDs, run it; then promote the admin (input #4).
7. **Harden `getMyTipster()`** to `.maybeSingle()` (app code) so any tipster not yet
   linked degrades to null instead of a 500.

## Post-apply smoke (the §7 live checks)
- Rankings/channels render (the `tipster_stats` view resolves).
- Post a **screenshot** slip → appears, settles via `/api/verify`.
- Post a **booking-code** slip → worker verifies → legs land in `betslip_legs` →
  `/api/verify` settles it (the unified-settlement seam).
- Paywall: pending coded slip never exposes `booking_code`/legs publicly; reveal
  works post-purchase (ioTec).
- Admin: log in (Supabase admin), Settle tab settles win/loss/void; dev Slips/Txns tabs work.
- Run `npm run test:e2e`.

## Rollback
Migrations are additive (new tables/columns/policies). To roll back: drop the
**added** objects (`transactions`, `slip_verifications`, `betslip_secrets`, `profiles`,
`platform_settings`, the added columns, the new policies) and restore main's permissive
RLS from `git show main:src/lib/rls.sql`. No main data is mutated except the
`betslip_secrets` copy-then-null move (reversible from `betslip_secrets`).
