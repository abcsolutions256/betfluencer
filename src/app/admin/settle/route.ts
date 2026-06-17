import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Admin manual settlement.
// POST { slip_id, result: 'win'|'loss'|'void'|'pending' }
// Optionally pass admin_key to gate access.
export async function POST(req: NextRequest) {
  try {
    const { slip_id, result, admin_key } = await req.json()

    // Simple gate — set ADMIN_SETTLE_KEY in Vercel env. If unset, allow (dev).
    const expected = process.env.ADMIN_SETTLE_KEY
    if (expected && admin_key !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const valid = ['win', 'loss', 'void', 'pending']
    if (!slip_id || !valid.includes(result)) {
      return NextResponse.json({ error: 'slip_id and valid result required' }, { status: 400 })
    }

    const db = supabaseServer()
    const { error } = await db
      .from('betslips')
      .update({ result, result_proof_pending: false })
      .eq('id', slip_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also settle the legs to match (best-effort, non-fatal)
    if (result === 'win' || result === 'loss') {
      await db.from('betslip_legs').update({ result }).eq('betslip_id', slip_id)
    }

    return NextResponse.json({ success: true, slip_id, result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}