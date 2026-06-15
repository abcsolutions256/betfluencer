// A tipster's slips. The owner (logged-in tipster) sees ALL of their slips
// (any verification status); the public sees verified + finished only.
// PROOF only — no secrets (those come from /api/slips/[id]/reveal).
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const PROOF_COLS = 'id, tipster_id, posting_mode, total_odds, leg_count, game_count, leagues, markets, earliest_kickoff, result, slip_price, verification_status, posted_at, created_at'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const db   = supabaseServer()
  const slug = params.slug
  const isUuid = /^[0-9a-f-]{36}$/i.test(slug)

  // Resolve the tipster by id (dashboard) or username (channel).
  const { data: tip } = isUuid
    ? await db.from('tipsters').select('id, profile_id').eq('id', slug).maybeSingle()
    : await db.from('tipsters').select('id, profile_id').ilike('username', slug).maybeSingle()
  if (!tip) return NextResponse.json({ slips: [] })

  // Is the caller the owning tipster?
  const user  = await getSessionUser()
  const owner = !!user && tip.profile_id === user.id

  let q = db.from('betslips').select(PROOF_COLS).eq('tipster_id', tip.id).order('posted_at', { ascending: false }).limit(50)
  if (!owner) q = q.or('verification_status.eq.verified,result.eq.win,result.eq.loss')

  const { data } = await q
  return NextResponse.json({ slips: data ?? [] })
}
