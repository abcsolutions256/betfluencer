import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { paidSlipIds, gateSlip } from '@/lib/entitlement'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const db    = supabaseServer()
  const buyer = new URL(req.url).searchParams.get('buyer')

  const { data } = await db
    .from('betslips')
    .select('*')
    .eq('tipster_id', params.slug)
    .order('posted_at', { ascending: false })
    .limit(50)

  const slips = data ?? []
  // Gate paid content: only slips this buyer has paid for keep their picks.
  const paid  = await paidSlipIds(buyer, slips.map((s: any) => s.id))
  return NextResponse.json({ slips: slips.map((s: any) => gateSlip(s, paid.has(s.id))) })
}
