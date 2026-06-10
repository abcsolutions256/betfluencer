// ── Auto-verification endpoint ────────────────────────────────────
// Called by a cron job daily to check finished matches
// and update slip results automatically

import { NextRequest, NextResponse } from 'next/server'
import { verifySlip, calcSlipResult } from '@/lib/footballApi'
import { supabaseServer } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const db = supabaseServer()

  const { data: pendingSlips } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .eq('posting_mode', 'manual')
    .eq('result', 'pending')

  if (!pendingSlips?.length) return NextResponse.json({ verified: 0 })

  let verifiedCount = 0

  for (const slip of pendingSlips) {
    const legs = slip.betslip_legs ?? []

    // Only verify if all matches have had time to finish (2hr buffer)
    const latestMatch = Math.max(...legs.map((l: any) => new Date(l.match_time).getTime()))
    if (latestMatch > Date.now() - 2 * 60 * 60 * 1000) continue

    const legResults = await verifySlip(legs)
    const slipResult = calcSlipResult(legResults.map(r => r.result))

    if (slipResult === 'pending') continue

    // Update each leg
    for (const lr of legResults) {
      if (lr.result === 'win' || lr.result === 'loss') {
        await db.from('betslip_legs').update({ result: lr.result }).eq('id', lr.id)
      }
    }

    // Update slip — flag unverifiable ones for admin
    if (slipResult === 'unverifiable') {
      await db.from('betslips').update({ result: 'pending', result_proof_pending: true }).eq('id', slip.id)
    } else {
      await db.from('betslips').update({ result: slipResult }).eq('id', slip.id)
      verifiedCount++
    }
  }

  return NextResponse.json({ verified: verifiedCount, total: pendingSlips.length })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'POST to this endpoint to trigger verification',
    note: 'Runs daily via Vercel cron at 2am',
  })
}