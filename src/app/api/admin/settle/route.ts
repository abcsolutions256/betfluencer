import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// Admin manual settlement (main feature, re-guarded onto Supabase Auth in the
// stag merge — the legacy ADMIN_SETTLE_KEY/admin_key gate is removed; auth is
// now the admin session cookie via requireRole('admin')).
// POST { slip_id, result: 'win'|'loss'|'void'|'pending' }
export async function POST(req: NextRequest) {
  try {
    if (!(await requireRole('admin'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slip_id, result } = await req.json()

    const valid = ['win', 'loss', 'void', 'pending']
    if (!slip_id || !valid.includes(result)) {
      return NextResponse.json({ error: 'slip_id and valid result required' }, { status: 400 })
    }

    const db = supabaseServer()

    // Update the betslip result ('void' allowed once migration 0012 widens the
    // result CHECK on betslips + betslip_legs). settled_at stamps the settle
    // time (powers the Wins 24h window); resetting to pending clears it.
    const { error: slipError } = await db
      .from('betslips')
      .update({
        result,
        result_proof_pending: false,
        settled_at: result === 'pending' ? null : new Date().toISOString(),
      })
      .eq('id', slip_id)

    if (slipError) return NextResponse.json({ error: slipError.message }, { status: 500 })

    // Cascade a decisive outcome to the legs (win/loss/void).
    if (result === 'win' || result === 'loss' || result === 'void') {
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