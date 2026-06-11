import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { logEarning } from '@/lib/db'
import { supabaseServer } from '@/lib/supabase'
import { collectPayment, disburseTipster, refundUser, smsTemplates, sendSMS } from '@/lib/payments'
import { z } from 'zod'

const schema = z.object({
  slip_id:    z.string(),
  tipster_id: z.string(),
  user_phone: z.string().min(8),
  user_name:  z.string().optional(),
})

export async function GET(req: NextRequest) {
  const db = supabaseServer()
  const phone = req.nextUrl.searchParams.get('phone') ?? ''
  const { data } = await db
    .from('slip_purchases')
    .select('*, tipsters(name, username)')
    .eq('user_phone', phone)
    .order('purchased_at', { ascending: false })
  return NextResponse.json({ subscriptions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = rateLimit('subscribe', ip)
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const body   = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { slip_id, tipster_id, user_phone, user_name } = parsed.data
  const db = supabaseServer()

  const { data: tipster } = await db
    .from('tipsters')
    .select('id, name, phone')
    .eq('id', tipster_id)
    .single()
  if (!tipster) return NextResponse.json({ error: 'Tipster not found' }, { status: 404 })

  const { data: slip } = await db
    .from('betslips')
    .select('id, slip_price')
    .eq('id', slip_id)
    .single()
  if (!slip) return NextResponse.json({ error: 'Slip not found' }, { status: 404 })

  const gross = slip.slip_price
  const ref   = `slip-${slip_id}-${Date.now()}`

  const collection = await collectPayment({ phone: user_phone, amount: gross, ref, name: user_name })
  if (!collection.success) {
    return NextResponse.json({ success: false, error: 'Payment failed. Check your number and try again.' })
  }

  let disbursed = false
  let tipsterAmount = 0, commissionAmount = 0
  for (let i = 1; i <= 3; i++) {
    try {
      const result = await disburseTipster({ phone: tipster.phone, grossAmount: gross, ref, tipsterName: tipster.name })
      if (result.success) {
        disbursed = true
        tipsterAmount = result.tipsterAmount
        commissionAmount = result.commissionAmount
        break
      }
    } catch (_) {}
    if (i < 3) await new Promise(r => setTimeout(r, i * 5000))
  }

  if (!disbursed) {
    await refundUser({ phone: user_phone, amount: gross, ref })
    await sendSMS({ to: user_phone, message: smsTemplates.refund(gross) })
    return NextResponse.json({ success: false, refunded: true })
  }

  await db.from('slip_purchases').insert({
    betslip_id:   slip_id,
    tipster_id,
    user_phone,
    user_name:    user_name ?? '',
    amount_paid:  gross,
    status:       'active',
    purchased_at: new Date().toISOString(),
  })

  await logEarning({
    tipster_id,
    amount:     tipsterAmount,
    gross,
    commission: commissionAmount,
    plan:       'slip',
    user_phone,
  })

  return NextResponse.json({ success: true, slip_id, tipster_amount: tipsterAmount })
}