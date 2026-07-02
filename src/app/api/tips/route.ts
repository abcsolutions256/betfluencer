// Post one or more slips. The poster is resolved from the session (must be
// a tipster). Secrets (booking code/site, screenshot URL) go to
// betslip_secrets — never onto betslips. Booking-code slips start
// 'pending' and are verified by the worker; manual/screenshot slips have
// no code to scrape, so they're 'verified' on post (proof derived now).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getMyTipster } from '@/lib/auth/session'
import { verifyAndRecord } from '@/lib/verifyCode'

export const dynamic = 'force-dynamic'

const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean)))

export async function POST(req: NextRequest) {
  try {
    const tipster = await getMyTipster()
    if (!tipster) return NextResponse.json({ error: 'Not signed in as a tipster' }, { status: 401 })

    const { slips } = await req.json()
    if (!slips?.length) return NextResponse.json({ error: 'No slips' }, { status: 400 })

    const db = supabaseServer()
    const inserted: any[] = []

    for (const slip of slips) {
      // Input method, by priority: booking_code -> screenshot -> manual
      const mode: 'booking_code' | 'screenshot' | 'manual' =
        slip.booking_code ? 'booking_code' : slip.slip_image_url ? 'screenshot' : 'manual'
      const legs: any[] = slip.legs ?? []
      const status = mode === 'booking_code' ? 'pending' : 'verified'

      const totalOdds = slip.total_odds !== '' && slip.total_odds != null
        ? parseFloat(slip.total_odds) : null
      const legCount = legs.length
        ? legs.length
        : (slip.leg_count !== '' && slip.leg_count != null
          ? parseInt(slip.leg_count) : null)

      // 1) the betslip (NO secret columns)
      const { data: bs, error } = await db
        .from('betslips')
        .insert({
          tipster_id:          tipster.id,
          posting_mode:        mode,
          total_odds:          totalOdds,
          leg_count:           legCount,
          slip_price:          slip.slip_price ?? 1000,
          note:                slip.note ?? '',
          result:              'pending',
          verification_status: status,
          verified_at:         status === 'verified' ? new Date().toISOString() : null,
          // proof for manual/screenshot (booking-code proof comes from verify)
          game_count:          mode === 'booking_code' ? null : (legs.length || null),
          leagues:             mode === 'booking_code' ? [] : uniq(legs.map((l: any) => l.league)),
          markets:             mode === 'booking_code' ? [] : uniq(legs.map((l: any) => l.market)),
        })
        .select()
        .single()
      if (error) {
        console.error('Slip insert error:', error)
        return NextResponse.json({ error: 'Could not save slip: ' + error.message }, { status: 500 })
      }

      // 2) the secret (booking code/site or screenshot URL)
      if (slip.booking_code || slip.slip_image_url) {
        await db.from('betslip_secrets').insert({
          betslip_id:     bs.id,
          booking_code:   slip.booking_code ?? null,
          betting_site:   slip.betting_site ?? null,
          slip_image_url: slip.slip_image_url ?? null,
        })
      }

      // 3) manual legs
      if (legs.length) {
        const { error: legsError } = await db.from('betslip_legs').insert(legs.map((l: any) => ({
          betslip_id:     bs.id,
          match:          l.match ?? '',
          league:         l.league ?? '',
          pick:           l.pick ?? '',
          odds:           l.odds ? parseFloat(l.odds) : null,
          match_time:     l.match_time || null,
          result:         'pending',
          market:         l.market ?? null,
          market_subject: l.market_subject ?? null,
          side:           l.side ?? null,
          line:           l.line != null && l.line !== '' ? Number(l.line) : null,
        })))
        if (legsError) console.error('Legs insert error:', legsError)
      }

      // 4) booking-code slips: verify against the bookie (sets verified + proof on success)
      if (mode === 'booking_code') {
        verifyAndRecord(bs.id, slip.betting_site, slip.booking_code).catch(() => {})
      }

      inserted.push({ ...bs, verification_status: status })
    }

    return NextResponse.json({ status: 'success', result: inserted.length, slips: inserted, tip: inserted[0] })
  } catch (e: any) {
    console.error('Post tip error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
