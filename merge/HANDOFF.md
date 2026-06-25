# HANDOFF — `stag` merge (main ↔ dev/payments)

Continuation state for a fresh session. Read `merge/README.md` then this file.

## Where things stand
- Branch **`stag`** (cut from `dev/payments`) holds the additive merge of `main`.
  **Local only, not pushed.** 4 commits:
  `40aa069` dossier · `1b5f531` merge · `ef3fd50` migrations · `36851cc` docs.
- **Code merge DONE.** `tsc --noEmit` clean (0 errors). Zero conflict markers.
- All §7 features preserved (both input methods + both verifiers). Unified
  settlement seam built. Auth = dev/payments Supabase Auth only; main admin re-wired.

## Locked owner decisions (do not relitigate)
1. Preserve main's REAL prod data — additive, non-destructive migrations only.
2. **Unify settlement** — code-entered slips settle via main's football API (built).
3. dev/payments Supabase Auth is the only auth.
4. DB baseline = main's prod; dev objects layered as appended idempotent migrations.
5. Apply migrations **directly to main prod** (no staging) when creds arrive.

## NOT done (the next-session work)
1. **Apply migrations `supabase/migrations/20260626000000`–`05` to main's prod.**
   Authored + adversarially reviewed; idempotent/additive/non-destructive. NOT applied.
   Exact sequence: `merge/db-apply-runbook.md`. Needs (blocked):
   - main Supabase creds (project ref + service-role / DB connection string)
   - real `tipster_stats` DDL: `select pg_get_viewdef('public.tipster_stats'::regclass, true);`
   - tipster backfill emails (seeded tipsters have none → synthesize or display-only?)
   - admin auth UID/email to promote `profiles.role='admin'`
   - enable Supabase Auth on main's project; `migration repair --status applied` the
     dev 0001–0010 (they ran on the dev project, not prod).
2. **`20260626000005` backfill** is a guarded NO-OP template (P0 tipster `profile_id`
   NULL) — fill real values + create Auth users out-of-band, then run.
3. **Harden `getMyTipster()`** → `.maybeSingle()` (pairs with backfill).
4. **Runtime validation** (not run — needs DB/services): `next build`,
   `npm run test:e2e`, live both-inputs→both-verifiers smoke. See `merge/verification.md`.
5. **`productions` branch** — prepare from `stag`, but AWAIT owner sign-off before
   creating/pushing.
6. Refine `pickForLeg` (verifyCode.ts) market→pick mapping against real Gemini output.
7. Security: rotate `Betfluencer@Admin2026` (in main's git history).

## Constraints
- Do NOT modify `main` or `dev/payments`. Work on `stag`.
- Do NOT push or cut `productions` without sign-off.
- Secrets by name only.

## Dossier index (all in `merge/`)
README, main-memory, dev-payments-memory, main-bugs, dev-payments-bugs,
db-harmonization, environments, slip-lifecycle, auth-integration, changes,
conflict-log, verification, db-apply-runbook, `.analysis/` (raw provenance).
