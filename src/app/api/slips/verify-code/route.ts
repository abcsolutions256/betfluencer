// ── POST /api/slips/verify-code ───────────────────────────────────
// Admin-triggered manual verification: scrape a booking code via the
// bet-code worker and upsert the match details into slip_verifications.
// Shared logic lives in @/lib/verifyCode (also used by the auto-trigger
// in /api/tips and the /api/slips/sync-codes poller).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth/session'
import { verifyAndRecord } from '@/lib/verifyCode'

const schema = z.object({
  betting_site: z.string().min(1),
  booking_code: z.string().min(1),
  betslip_id:   z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { betting_site, booking_code, betslip_id } = parsed.data

  if (!process.env.BET_CODE_WORKER_URL) {
    return NextResponse.json({ error: 'Bet-code worker not configured' }, { status: 503 })
  }

  const result = await verifyAndRecord(betslip_id ?? null, betting_site, booking_code)

  return NextResponse.json({
    ok:             !!result?.ok,
    found:          result?.found ?? false,
    count:          result?.count ?? 0,
    matches:        result?.matches ?? [],
    raw_text:       result?.raw_text ?? '',
    screenshot_url: result?.screenshot_url ?? null,
    error:          result?.error,
  })
}
