// Admin slip moderation. GET lists recent slips (incl. hidden); POST toggles
// the `hidden` flag — the manual way to pull a stale/expired slip off the
// marketplace. Admin only (Supabase Auth role).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'
import { marketFilterFromRequest, filterByTipsterIds } from '@/lib/countryFilter'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  const marketIds = await marketFilterFromRequest(db, req)   // ?market=XX → that market only
  const { data, error } = await db
    .from('betslips')
    .select('id, tipster_id, posting_mode, verification_status, result, total_odds, game_count, markets, earliest_kickoff, hidden, posted_at, tipsters ( name, username )')
    .order('posted_at', { ascending: false })
    .limit(80)
  if (error) return NextResponse.json({ slips: [], error: error.message })
  return NextResponse.json({ slips: filterByTipsterIds(data ?? [], marketIds, 'tipster_id') })
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { betslip_id, hidden } = await req.json().catch(() => ({}))
  if (!betslip_id) return NextResponse.json({ error: 'betslip_id required' }, { status: 400 })
  const db = supabaseServer()
  const { error } = await db.from('betslips').update({ hidden: !!hidden }).eq('id', betslip_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, betslip_id, hidden: !!hidden })
}
