// Admin override of a slip's verification status (verify / reject / etc.).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const schema = z.object({
  betslip_id: z.string().uuid(),
  status:     z.enum(['verified', 'failed', 'rejected', 'pending']),
})

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { betslip_id, status } = parsed.data

  const db = supabaseServer()
  await db.from('betslips').update({
    verification_status: status,
    verified_at:         status === 'verified' ? new Date().toISOString() : null,
  }).eq('id', betslip_id)
  return NextResponse.json({ ok: true })
}
