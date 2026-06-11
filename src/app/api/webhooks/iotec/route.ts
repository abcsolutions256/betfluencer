// ── ioTec Pay webhook handler ─────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { supabaseServer } from '@/lib/supabase'

function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.IOTEC_WEBHOOK_SECRET ?? ''
  if (!secret) return true  // skip in demo mode

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(req: NextRequest) {
  try {
    const rawBody   = await req.text()
    const signature = req.headers.get('x-iotec-signature') ??
                      req.headers.get('x-webhook-signature') ?? ''

    // Verify webhook is genuinely from ioTec
    if (signature && !verifySignature(rawBody, signature)) {
      console.error('ioTec webhook: invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const db      = supabaseServer()
    const { reference, status, transactionId, amount, phone } = payload

    const isSuccess = ['successful', 'success', 'completed'].includes(
      (status ?? '').toLowerCase()
    )

    if (!reference) return NextResponse.json({ received: true })

    if (db) {
      await db
        .from('payments')
        .update({
          status: isSuccess ? 'confirmed' : 'failed',
          flw_ref: transactionId ?? reference,
        })
        .eq('flw_ref', reference)

      if (isSuccess) {
        const { data: payment } = await db
          .from('payments')
          .select('purchase_id')
          .eq('flw_ref', reference)
          .single()

        if (payment?.purchase_id) {
          await db
            .from('slip_purchases')
            .update({ status: 'active' })
            .eq('id', payment.purchase_id)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('ioTec webhook error:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
