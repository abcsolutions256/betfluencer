import { NextRequest, NextResponse } from 'next/server'
import { createTip, getTipsByTipster } from '@/lib/db'
import { sendSMS, smsTemplates } from '@/lib/payments'
import { getSubscriptionsByPhone } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({
  tipster_id: z.string(),
  match:      z.string().min(3),
  pick:       z.string().min(2),
  odds:       z.number().min(1),
  league:     z.string().optional(),
  match_time: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const tip = await createTip({
    tipster_id: parsed.data.tipster_id,
    match:      parsed.data.match,
    pick:       parsed.data.pick,
    odds:       parsed.data.odds,
    match_time: parsed.data.match_time ?? new Date().toISOString(),
  })

  if (!tip) return NextResponse.json({ error: 'Could not post tip' }, { status: 500 })

  // Notify subscribers — get all active subs for this tipster
  // In production this should be a background job, not blocking
  try {
    const allSubs = await getSubscriptionsByPhone('') // placeholder
    // TODO: query subscriptions by tipster_id, send SMS to each
  } catch (_) {}

  return NextResponse.json({ tip })
}
