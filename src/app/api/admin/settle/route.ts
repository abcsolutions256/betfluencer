import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Admin manual settlement.
// POST { slip_id, result: 'win'|'loss'|'void'|'pending', admin_key }
export async function POST(req: NextRequest) {
  try {
    const { slip_id, result, admin_key } = await req.json()

    // Gate with ADMIN_SETTLE_KEY env var if set; otherwise allow (uses admin token)
    const expected = process.env.ADMIN_SETTLE_KEY
    if (expected && admin_key !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const valid = ['win', 'loss', 'void', 'pending']
    if (!slip_id || !valid.includes(result)) {
      return NextResponse.json({ error: 'slip_id and valid result required' }, { status: 400 })
    }

    const db = supabaseServer()

    // Update the betslip result
    const { error: slipError } = await db
      .from('betslips')
      .update({ result, result_proof_pending: false })
      .eq('id', slip_id)

    if (slipError) return NextResponse.json({ error: slipError.message }, { status: 500 })

    // Update all legs to match
    if (result === 'win' || result === 'loss') {
      await db
        .from('betslip_legs')
        .update({ result })
        .eq('betslip_id', slip_id)
    }

    return NextResponse.json({ success: true, slip_id, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}