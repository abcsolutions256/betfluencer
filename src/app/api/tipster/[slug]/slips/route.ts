import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const db = supabaseServer()
  const { data } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .eq('tipster_id', params.slug)
    .order('posted_at', { ascending: false })
    .limit(50)

  const slips = (data ?? []).map((s: any) => ({
    ...s,
    legs: s.betslip_legs ?? [],
  }))

  return NextResponse.json({ slips })
}