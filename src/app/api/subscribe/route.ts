import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

// Buyer's purchases by phone (the "Mine" page). Per-slip model.
// Payment initiation now lives at POST /api/payments/initiate (ioTec).
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') ?? ''
  const db = supabaseServer()
  const { data } = await db
    .from('slip_purchases')
    .select('*, tipster:tipsters(name, username)')
    .eq('user_phone', phone)
    .order('purchased_at', { ascending: false })
  return NextResponse.json({ subscriptions: data ?? [] })
}
