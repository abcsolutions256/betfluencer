import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// The logged-in buyer's purchases (the "Mine" page) — tied to the account,
// so they follow the user across devices. Payment initiation lives at
// POST /api/payments/initiate.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ subscriptions: [] })
  const db = supabaseServer()
  const { data } = await db
    .from('slip_purchases')
    .select('id, status, amount_paid, purchased_at, betslip_id, tipster:tipsters(name, username), betslip:betslips(id, total_odds, game_count, result, verification_status)')
    .eq('buyer_id', user.id)
    .order('purchased_at', { ascending: false })
  return NextResponse.json({ subscriptions: data ?? [] })
}
