-- ============================================================================
-- MERGE 20260626000003 — widen result CHECK to include 'void' (§2.4 settlement)
-- ============================================================================
-- PURPOSE
--   POST /api/admin/settle writes result='void', but neither branch's CHECK
--   allows it (both are ('pending','win','loss')) — a latent write failure.
--   Admin manual settlement is preserved in the merge, so the CHECK on BOTH
--   betslips.result AND betslip_legs.result must be WIDENED to include 'void'.
--
-- TARGET
--   main's PROD DB (already has betslips/betslip_legs with the 3-value CHECK).
--
-- PROPERTIES
--   Idempotent      — DO-blocks drop the existing constraint (if present) then
--                     re-add the widened one; safe to run twice.
--   Additive        — CHECK is WIDENED, never narrowed.
--   Non-destructive — all existing rows ('pending'/'win'/'loss') satisfy the new
--                     constraint; no data touched.
--
-- NOTE on constraint names: main created these CHECKs inline, so Postgres
-- auto-named them `betslips_result_check` / `betslip_legs_result_check`. We drop
-- by that conventional name (IF EXISTS, so a differently-named constraint is left
-- alone) and re-add an explicitly-named widened constraint.
-- ============================================================================

-- ── betslips.result → include 'void' ──
do $$
begin
  alter table betslips drop constraint if exists betslips_result_check;
  alter table betslips add  constraint betslips_result_check
    check (result in ('pending','win','loss','void'));
end $$;

-- ── betslip_legs.result → include 'void' ──
do $$
begin
  alter table betslip_legs drop constraint if exists betslip_legs_result_check;
  alter table betslip_legs add  constraint betslip_legs_result_check
    check (result in ('pending','win','loss','void'));
end $$;
