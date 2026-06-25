//── Auto-verification endpoint ────────────────────────────────────────
// Called by a cron job daily to check finished matches
// and update slip results automatically
import { NextRequest, NextResponse } from 'next/server'
import { verifySlip, calcSlipResult } from '@/lib/footballApi'
import { supabaseServer } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const db = supabaseServer()

  // Fetch all pending slips across all posting modes
  const { data: pendingSlips } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .in('posting_mode', ['manual', 'screenshot', 'booking_code'])
    .eq('result', 'pending')

  if (!pendingSlips?.length) return NextResponse.json({ verified: 0, total: 0 })

  let verifiedCount = 0

  for (const slip of pendingSlips) {
    const legs = slip.betslip_legs ?? []

    // Skip booking code slips with no legs — need manual result upload
    if (!legs.length) continue

    // Only verify if all matches have had time to finish (2hr buffer)
    const matchTimes = legs
      .map((l: any) => new Date(l.match_time).getTime())
      .filter((t: number) => !isNaN(t))

    // If no match times, fall back to posted_at + 3 hours
    const cutoff = matchTimes.length
      ? Math.max(...matchTimes)
      : new Date(slip.posted_at).getTime()

    if (cutoff > Date.now() - 3 * 60 * 60 * 1000) continue

    const legResults = await verifySlip(legs)
    const slipResult = calcSlipResult(legResults.map(r => r.result))

    if (slipResult === 'pending') continue

    // Update each leg result
    for (const lr of legResults) {
      if (lr.result === 'win' || lr.result === 'loss') {
        await db.from('betslip_legs').update({ result: lr.result }).eq('id', lr.id)
      }
    }

    // Update slip — flag unverifiable ones for admin review
    if (slipResult === 'unverifiable') {
      await db.from('betslips')
        .update({ result: 'pending', result_proof_pending: true })
        .eq('id', slip.id)
    } else {
      await db.from('betslips')
        .update({ result: slipResult })
        .eq('id', slip.id)
      verifiedCount++
    }
  }

  return NextResponse.json({ verified: verifiedCount, total: pendingSlips.length })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'POST to this endpoint to trigger verification',
    note: 'Runs daily via Vercel cron at 2am UTC (5am Uganda time)',
  })
}