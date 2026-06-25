-- ============================================================================
-- MERGE 20260626000000 — tipster_stats view (BEST-EFFORT RECONSTRUCTION)
-- ============================================================================
-- PURPOSE
--   The running app on `main` queries the `tipster_stats` view at 7 call-sites
--   (rankings page + tipster stats route). That view exists ONLY in main's LIVE
--   production DB — it is in NO tracked SQL file on either branch (it was applied
--   directly via the Supabase SQL Editor). This migration reconstructs it so the
--   merged migration set is self-contained and the rankings page does not break
--   on a FRESH database (e2e / staging / a rebuilt environment).
--
-- TARGET
--   main's PROD DB (already has tipsters / betslips / slip_purchases populated
--   AND already has a working `tipster_stats` view) — and fresh DBs that lack it.
--
-- PROD-SAFETY (the important bit)
--   `create or replace view` CANNOT change an existing view's column set/order
--   and would ERROR on prod if prod's column list differs in any way. So this
--   migration is GUARDED: it creates the view ONLY IF it does not already exist.
--     • On PROD (view already exists) → SKIPPED — the authoritative live view is
--       left untouched (no error, no risk of changing the ranking math).
--     • On a FRESH DB (no view) → the reconstruction below is created.
--
-- PROPERTIES
--   Idempotent      — existence-guarded; safe to run twice.
--   Additive        — only (conditionally) defines a view; touches no rows.
--   Non-destructive — never drops/replaces an existing view; holds no data.
--
-- ⚠️⚠️⚠️  TODO — THIS IS A RECONSTRUCTION, NOT THE REAL DDL  ⚠️⚠️⚠️
--   If you ever need the merged set to MATCH prod exactly (or to replace prod's
--   view), dump the authoritative DDL and paste it over the body below:
--
--       select pg_get_viewdef('public.tipster_stats'::regclass, true);
--
--   The column SET is derived from the app consumers (src/app/rankings/page.tsx +
--   src/app/api/tipster/[slug]/stats/route.ts) and is believed correct, but the
--   exact aggregation math (losses, roi, last5, score, win/settled windows after
--   commits 40ba53c / bdbcc43) may differ from prod. The guard above means prod's
--   real view wins by default; this body only ever materialises on a fresh DB.
--
-- CONSUMER CONTRACT (columns the app reads — see rankings/page.tsx TipsterRow):
--   id, name, username, sport, wins_last_10, losses, slips_posted, avg_odds,
--   roi, last5, subscriber_count, tick_type, verified, slug
--   plus (stats route / other call-sites): score, created_at, subscriber_count.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'tipster_stats'
  ) then
    execute $view$
      create view tipster_stats as
      with last10 as (
        -- the 10 most-recently-posted slips per tipster (wins/losses/last5)
        select
          b.tipster_id,
          b.result,
          b.total_odds,
          b.posted_at,
          row_number() over (
            partition by b.tipster_id order by b.posted_at desc
          ) as rn
        from betslips b
      )
      select
        t.id,
        t.name,
        t.username,
        -- slug: app routes tipsters by username (lower-cased). Adjust if prod differs.
        lower(t.username)                                    as slug,
        t.sport,
        t.verified,
        t.tick_type,
        t.created_at,

        -- subscriber_count: active purchases for this tipster
        coalesce((
          select count(*) from slip_purchases p
          where p.tipster_id = t.id and p.status = 'active'
        ), 0)                                                as subscriber_count,

        -- wins_last_10: wins among the last 10 posted slips
        coalesce((
          select count(*) from last10 l
          where l.tipster_id = t.id and l.rn <= 10 and l.result = 'win'
        ), 0)                                                as wins_last_10,

        -- losses: losses among the last 10 posted slips (settled = wins + losses,
        -- commit 40ba53c). 'void'/'pending' are neither win nor loss.
        coalesce((
          select count(*) from last10 l
          where l.tipster_id = t.id and l.rn <= 10 and l.result = 'loss'
        ), 0)                                                as losses,

        -- slips_posted: total slips ever posted by this tipster
        coalesce((
          select count(*) from betslips b where b.tipster_id = t.id
        ), 0)                                                as slips_posted,

        -- avg_odds: average total_odds of winning slips in the last 7 days
        -- (mirrors update_tipster_tick() / tipster_rankings; default 1.0)
        coalesce((
          select round(avg(b.total_odds)::numeric, 1)
          from betslips b
          where b.tipster_id = t.id
            and b.result = 'win'
            and b.posted_at > now() - interval '7 days'
        ), 1.0)                                              as avg_odds,

        -- roi: percentage return over the last 10 settled slips, staking 1 unit
        -- each. win returns total_odds units; loss returns 0.
        -- (Reconstruction — verify exact prod formula via pg_get_viewdef.)
        coalesce((
          select round(
            ( sum(case when l.result = 'win' then l.total_odds else 0 end)
              - count(*) )
            / nullif(count(*), 0) * 100
          , 1)
          from last10 l
          where l.tipster_id = t.id
            and l.rn <= 10
            and l.result in ('win','loss')
        ), 0)                                                as roi,

        -- last5: compact string of the 5 most-recent results, e.g. "WWLWP".
        -- W=win, L=loss, V=void, P=pending (one char per slip, newest first).
        coalesce((
          select string_agg(
            case l.result
              when 'win'  then 'W'
              when 'loss' then 'L'
              when 'void' then 'V'
              else 'P'
            end, '' order by l.rn
          )
          from last10 l
          where l.tipster_id = t.id and l.rn <= 5
        ), '')                                               as last5,

        -- score: ranking score = wins_last_10 * avg_odds (matches stats/route.ts:26
        -- and tipster_rankings). win-rate × odds is applied in app code per commit
        -- bdbcc43, but the base view score remains wins × avg_odds.
        coalesce((
          select count(*) from last10 l
          where l.tipster_id = t.id and l.rn <= 10 and l.result = 'win'
        ), 0)
        * coalesce((
          select round(avg(b.total_odds)::numeric, 1)
          from betslips b
          where b.tipster_id = t.id
            and b.result = 'win'
            and b.posted_at > now() - interval '7 days'
        ), 1.0)                                              as score

      from tipsters t
      order by score desc
    $view$;
  end if;
end $$;
