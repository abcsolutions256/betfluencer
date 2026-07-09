import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'
import { loadCountries } from '@/lib/country'
import { marketFilterFromRequest } from '@/lib/countryFilter'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ stats: { subscribers: 0, tipsters: 0, commission: 0, liveAds: 0 }, activity: [], byCountry: [] })

  // Optional ?market=XX from the admin market switcher; null = all markets.
  const marketIds = await marketFilterFromRequest(db, req)
  const scoped = <T extends { in: (col: string, vals: string[]) => T }>(q: T): T =>
    marketIds ? q.in('tipster_id', Array.from(marketIds)) : q

  const [tipstersRes, { count: purchases }, { data: earnings }] = await Promise.all([
    marketIds ? Promise.resolve(null) : db.from('tipsters').select('*', { count: 'exact', head: true }),
    scoped(db.from('slip_purchases').select('*', { count: 'exact', head: true }) as any),
    scoped(db.from('earnings').select('commission').order('created_at', { ascending: false }).limit(100) as any),
  ] as any[])
  // With a market filter, the id set IS the market's tipster list.
  const tipsters = marketIds ? marketIds.size : tipstersRes?.count

  const commission = ((earnings ?? []) as any[]).reduce((s: number, e: any) => s + (e.commission ?? 0), 0)

  // slip_purchases' timestamp is purchased_at, not created_at (selecting/
  // ordering by a non-existent column errors the whole query → empty activity).
  const { data: recentPurchases } = await scoped(db
    .from('slip_purchases')
    .select('purchased_at, tipster_id, tipsters(name)') as any)
    .order('purchased_at', { ascending: false })
    .limit(5)

  const activity = ((recentPurchases ?? []) as any[]).map((p: any) => ({
    text: `New purchase — ${p.tipsters?.name ?? 'Unknown'} slip`,
    time: new Date(p.purchased_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
  }))

  // ── Per-market breakdown (overview strip; all-markets view only) ──
  // Groups tipsters / purchases / commission by country via the
  // tipster_countries links. Best-effort: a failure here never breaks
  // the headline stats.
  let byCountry: any[] = []
  if (!marketIds) {
    try {
      const [countries, linksRes, purch, earn] = await Promise.all([
        loadCountries(),
        db.from('tipster_countries').select('tipster_id, country_code'),
        db.from('slip_purchases').select('tipster_id'),
        db.from('earnings').select('tipster_id, commission, gross'),
      ])
      const codesByTipster = new Map<string, string[]>()
      for (const l of linksRes.data ?? []) {
        const arr = codesByTipster.get(l.tipster_id) ?? []
        arr.push(l.country_code)
        codesByTipster.set(l.tipster_id, arr)
      }
      const agg = new Map(countries.map(c => [c.code, {
        code: c.code, name: c.name, currency_code: c.currency_code,
        active: c.active, payments_enabled: c.payments_enabled,
        tipsters: 0, purchases: 0, commission: 0, gross: 0,
      }]))
      for (const codes of codesByTipster.values())
        for (const code of codes) { const a = agg.get(code); if (a) a.tipsters += 1 }
      for (const p of purch.data ?? [])
        for (const code of codesByTipster.get(p.tipster_id) ?? []) { const a = agg.get(code); if (a) a.purchases += 1 }
      for (const e of earn.data ?? [])
        for (const code of codesByTipster.get(e.tipster_id) ?? []) {
          const a = agg.get(code)
          if (a) { a.commission += e.commission ?? 0; a.gross += e.gross ?? 0 }
        }
      byCountry = Array.from(agg.values())
    } catch (e) {
      console.error('admin stats byCountry failed:', (e as Error)?.message)
    }
  }

  return NextResponse.json({
    stats: { subscribers: purchases ?? 0, tipsters: tipsters ?? 0, commission, liveAds: 0 },
    activity,
    byCountry,
  })
}
