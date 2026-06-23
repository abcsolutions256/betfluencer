import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// The buyer's purchases (the "Mine" page). Anonymous buyers — keyed on the
// localStorage guest id sent as the `x-buyer-key` header (or `?buyer=`).
// Per-browser only. Payment initiation lives at POST /api/payments/initiate.
export async function GET(req: Request) {
  const buyerKey = (req.headers.get('x-buyer-key') ?? new URL(req.url).searchParams.get('buyer') ?? '').trim()
  if (!buyerKey) return NextResponse.json({ subscriptions: [] })
  const db = supabaseServer()
  const { data } = await db
    .from('slip_purchases')
    .select('id, status, amount_paid, purchased_at, betslip_id, tipster:tipsters(name, username), betslip:betslips(id, total_odds, game_count, result, verification_status)')
    .eq('buyer_key', buyerKey)
    .order('purchased_at', { ascending: false })
  return NextResponse.json({ subscriptions: data ?? [] })
}
