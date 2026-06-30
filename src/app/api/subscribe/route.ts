import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { buyerFromRequest } from '@/lib/buyer'

export const dynamic = 'force-dynamic'

// The buyer's purchases (the "Mine" page). Buyers don't log in — they are
// identified by the phone they paid with, sent as the `x-buyer-phone` header
// (or `?buyer=`). Re-entering the phone on another device recovers purchases.
// Payment initiation lives at POST /api/payments/initiate.
export async function GET(req: Request) {
  const buyer = buyerFromRequest(req)
  if (!buyer) return NextResponse.json({ subscriptions: [] })
  const db = supabaseServer()
  const { data } = await db
    .from('slip_purchases')
    .select('id, status, amount_paid, purchased_at, betslip_id, tipster:tipsters(name, username), betslip:betslips(id, total_odds, game_count, result, verification_status)')
    .eq('user_phone', buyer)
    .order('purchased_at', { ascending: false })
  return NextResponse.json({ subscriptions: data ?? [] })
}
