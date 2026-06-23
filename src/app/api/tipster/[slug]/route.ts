import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const db = supabaseServer()

  // Resolve username -> id (falls back to treating slug as id)
  const { data: byUsername } = await db
    .from('tipster_stats')
    .select('id')
    .ilike('username', params.slug)
    .single()

  const tipsterId = byUsername?.id ?? params.slug

  const { data } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .eq('tipster_id', tipsterId)
    .order('posted_at', { ascending: false })
    .limit(50)

  const slips = (data ?? []).map((s: any) => ({
    ...s,
    legs: s.betslip_legs ?? [],
  }))

  return NextResponse.json(
    { slips },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}