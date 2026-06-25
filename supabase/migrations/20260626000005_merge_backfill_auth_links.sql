-- ============================================================================
-- MERGE 20260626000005 — P0 BACKFILL: bind existing tipsters to Supabase Auth
-- ============================================================================
-- PURPOSE
--   The schema migrations ADD tipsters.profile_id but never BACKFILL it — the
--   documented P0 login dead-end (dev-auth.md §6 / MEMORY "legacy profile_id
--   NULL"). getMyTipster() can't resolve a logged-in user to their tipster row
--   until every existing tipster is linked to a Supabase Auth user via
--   tipsters.profile_id, and that profile is promoted to role='tipster'. The
--   single platform admin must likewise be promoted to role='admin'.
--
-- TARGET
--   main's PROD DB, AFTER 20260626000001 created profiles + tipsters.profile_id
--   and Supabase Auth is enabled.
--
-- ⚠️ THIS IS A DOCUMENTED, GUARDED TEMPLATE — IT DOES NOT EXECUTE THE BACKFILL.
--   Creating Supabase Auth users requires real emails/passwords and the Auth Admin
--   API (auth.users rows cannot be safely hand-INSERTed in a plain SQL migration —
--   they need the GoTrue-managed columns: encrypted_password, aud, role,
--   confirmation, identities, etc.). So the actual user-creation step MUST be done
--   out-of-band (Auth Admin API / dashboard / a server script), then this file's
--   guarded UPDATEs bind the results. Everything below is a NO-OP as written:
--   the auth-user creation is commented, and every UPDATE is guarded by
--   `profile_id is null` plus obvious <<<REQUIRES INPUT>>> placeholders that, left
--   as-is, match no rows and write nothing.
--
-- PROPERTIES
--   Idempotent      — guarded by `where profile_id is null` / role checks; re-runs
--                     skip already-linked tipsters.
--   Additive        — only writes tipsters.profile_id and profiles.role.
--   Non-destructive — touches NO other column, NO other table, NO data rows.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0 (OUT OF BAND — NOT SQL) — create one Supabase Auth user per tipster
-- ════════════════════════════════════════════════════════════════════════════
-- For each existing `tipsters` row (the 4 seeded EnzoKampala / NairobiKing /
-- StatAttack / BetWiseUG plus any real tipster created on main), create a
-- Supabase Auth user via the Auth Admin API, e.g.:
--
--   supabase.auth.admin.createUser({
--     email: '<tipster-email-or-synthesized username@placeholder.local>',
--     password: '<temporary>',
--     email_confirm: true,
--     user_metadata: { display_name: '<tipster.name>' }
--   })
--
-- The on_auth_user_created trigger (handle_new_user) auto-inserts the matching
-- `profiles` row at role='user'. Record each new auth user's UID alongside the
-- tipster it belongs to, then fill them into STEP 1 below. Seeded tipsters have no
-- real email → synthesize `username@placeholder.local` (or treat as display-only).


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1 — link each tipster to its auth user  (per-tipster; one block each)
-- ════════════════════════════════════════════════════════════════════════════
-- Fill in the (auth UID, tipster username) pairs produced by STEP 0. The
-- placeholder UID below is NOT a valid value, and the `profile_id is null` guard
-- means an unfilled block matches nothing — so this file is a safe no-op as-is.
--
-- Repeat one DO-block per tipster:

do $$
declare
  -- <<<REQUIRES INPUT>>> the auth.users UID created for this tipster in STEP 0
  v_auth_uid uuid := null;            -- e.g. '00000000-0000-0000-0000-000000000000'::uuid
  -- <<<REQUIRES INPUT>>> the tipster this UID belongs to (match by username)
  v_username text := null;            -- e.g. 'EnzoKampala'
begin
  if v_auth_uid is null or v_username is null then
    raise notice 'backfill: STEP 1 block skipped (placeholders not filled)';
    return;                          -- no-op until real values are supplied
  end if;

  -- Ensure the profile exists (handle_new_user normally created it at STEP 0;
  -- this is a defensive upsert in case it did not).
  insert into profiles (id, role)
    values (v_auth_uid, 'tipster')
    on conflict (id) do update set role = 'tipster';

  -- Promote any pre-existing profile to 'tipster'.
  update profiles set role = 'tipster' where id = v_auth_uid;

  -- Bind the tipster row to the auth user — ONLY if still unlinked.
  update tipsters
     set profile_id = v_auth_uid
   where username = v_username
     and profile_id is null;
end $$;

-- ... (add one more DO-block per remaining tipster: NairobiKing, StatAttack,
--      BetWiseUG, plus any real tipster created on main) ...


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2 — promote the platform admin  (no code path sets role='admin')
-- ════════════════════════════════════════════════════════════════════════════
-- The real admin must be promoted manually. Create/identify the admin's Supabase
-- Auth user, then set its profile role to 'admin'. Guarded by the placeholder so
-- this is a no-op until <<<REQUIRES INPUT>>> is replaced with the real admin UID.

do $$
declare
  -- <<<REQUIRES INPUT>>> the admin's auth.users UID
  v_admin_uid uuid := null;          -- e.g. '<ADMIN_AUTH_UID>'::uuid
begin
  if v_admin_uid is null then
    raise notice 'backfill: STEP 2 admin promotion skipped (admin UID not filled)';
    return;                          -- no-op until the real admin UID is supplied
  end if;

  insert into profiles (id, role)
    values (v_admin_uid, 'admin')
    on conflict (id) do update set role = 'admin';

  update profiles set role = 'admin' where id = v_admin_uid;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- BUYERS — no backfill required.
-- ════════════════════════════════════════════════════════════════════════════
-- slip_purchases.buyer_id is intentionally nullable and stays NULL for legacy /
-- guest purchases; guests are now identified by buyer_key (0009), not auth. Legacy
-- NULL buyer_id rows remain valid under Postgres NULLS DISTINCT on the unique
-- index. payments / earnings / transactions identity is user_phone / buyer_key —
-- no auth link, nothing to backfill.
-- ============================================================================
