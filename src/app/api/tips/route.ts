import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { slips, tipster_id } = body
    if (!tipster_id || !slips?.length)
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const db = supabaseServer()
    const inserted = []

    for (const slip of slips) {
      const isBookingCode = !!slip.booking_code

      // Safely parse integers and floats — never pass empty strings
      const totalOdds = slip.total_odds !== '' && slip.total_odds != null
        ? parseFloat(slip.total_odds) : null
      const legCount = slip.legs?.length
        ? slip.legs.length
        : (slip.leg_count !== '' && slip.leg_count != null
          ? parseInt(slip.leg_count) : null)

      const { data, error } = await db
        .from('betslips')
        .insert({
          tipster_id,
          posting_mode: isBookingCode ? 'booking_code' : 'screenshot',
          booking_code: slip.booking_code  || null,
          betting_site: slip.betting_site  || null,
          total_odds:   totalOdds,
          leg_count:    legCount,
          slip_price:   slip.slip_price    ?? 1000,
          note:         slip.note          ?? '',
          result:       'pending',
        })
        .select()
        .single()

      if (error) {
        console.error('Slip insert error:', error)
        return NextResponse.json({ error: 'Could not save slip: ' + error.message }, { status: 500 })
      }
      inserted.push(data)

      // Insert legs if present (screenshot mode)
      if (slip.legs?.length && data?.id) {
        const legs = slip.legs.map((l: any) => ({
          betslip_id: data.id,
          tipster_id,
          match:      l.match      || '',
          league:     l.league     || '',
          pick:       l.pick       || '',
          odds:       parseFloat(l.odds) || 1,
          match_time: l.match_time || null,
          market:     l.market     || 'match_result',
          result:     'pending',
        }))
        await db.from('betslip_legs').insert(legs)
      }
    }

    return NextResponse.json({ status: 'success', result: inserted.length, slips: inserted })
  } catch (e: any) {
    console.error('Post tip error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}