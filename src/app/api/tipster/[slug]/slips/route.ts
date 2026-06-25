// A tipster's slips. The OWNER (logged-in tipster) sees ALL of their slips
// (any status) WITH the full content — booking code, site and the verified
// picks — because they own the tip. The public sees verified + finished
// slips, PROOF only (no secrets; customers pay for those via /reveal).
//
// Secret fields (booking_code, betting_site, slip_image_url) live in
// betslip_secrets and are ONLY attached for the owner — they must never
// appear in the public slip list. Legs (betslip_legs) are public proof and
// are attached for everyone. Seeded historical slips (note === '__seed__')
// are hidden from the public channel view.
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getSessionUser } from '@/lib/auth/session'
import { fetchHiddenSlipIds } from '@/lib/slipStatus'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Public-safe columns. NEVER includes secrets (booking_code/betting_site/
// slip_image_url). `note` is selected only so we can apply the seed-hide
// filter server-side; it is stripped before the response is returned.
const PROOF_COLS =
  'id, tipster_id, posting_mode, total_odds, leg_count, game_count, leagues, markets, earliest_kickoff, result, slip_price, verification_status, posted_at, note'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const db   = supabaseServer()
  const slug = params.slug
  const isUuid = /^[0-9a-f-]{36}$/i.test(slug)

  // Resolve the tipster by id (dashboard) or username (channel). We read from
  // `tipsters` (not the `tipster_stats` view) because ownership needs
  // profile_id to compare against the auth user.
  const { data: tip } = isUuid
    ? await db.from('tipsters').select('id, profile_id').eq('id', slug).maybeSingle()
    : await db.from('tipsters').select('id, profile_id').ilike('username', slug).maybeSingle()
  if (!tip) {
    return NextResponse.json(
      { slips: [] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }

  // Is the caller the owning tipster?
  const user  = await getSessionUser()
  const owner = !!user && tip.profile_id === user.id

  let q = db
    .from('betslips')
    .select(`${PROOF_COLS}, betslip_legs(*)`)
    .eq('tipster_id', tip.id)
    .order('posted_at', { ascending: false })
    .limit(200)
  if (!owner) q = q.or('verification_status.eq.verified,result.eq.win,result.eq.loss')

  const { data } = await q

  // Hide seeded historical slips from public view (NULL-safe filter in JS),
  // then cap to 50.
  let slips = (data ?? [])
    .filter((s: any) => s.note !== '__seed__')
    .slice(0, 50) as any[]
  const hidden = await fetchHiddenSlipIds(db)   // admin-hidden slips (best-effort)

  // Attach public-safe legs for everyone and drop the internal `note` field.
  slips = slips.map((s: any) => {
    const { note: _note, betslip_legs, ...rest } = s
    return { ...rest, legs: betslip_legs ?? [] }
  })

  // Owner-only: attach the secret content (code/site) + the Gemini-verified
  // picks so the tipster can see exactly what they posted. Same data a buyer
  // unlocks via /reveal — gated here to the owner, so it never leaks publicly.
  if (owner && slips.length) {
    const ids = slips.map((s) => s.id)
    const [{ data: secrets }, { data: verifs }] = await Promise.all([
      db.from('betslip_secrets').select('betslip_id, booking_code, betting_site, slip_image_url').in('betslip_id', ids),
      db.from('slip_verifications').select('betslip_id, normalized, summary, found').in('betslip_id', ids),
    ])
    const sec = new Map((secrets ?? []).map((s: any) => [s.betslip_id, s]))
    const ver = new Map((verifs ?? []).map((v: any) => [v.betslip_id, v]))
    slips = slips.map((s) => ({
      ...s,
      hidden:         hidden.has(s.id),              // admin-removed → owner sees a "Hidden" tag
      booking_code:   sec.get(s.id)?.booking_code   ?? null,
      betting_site:   sec.get(s.id)?.betting_site   ?? null,
      slip_image_url: sec.get(s.id)?.slip_image_url ?? null,
      normalized:     ver.get(s.id)?.normalized     ?? [],
      slip_summary:   ver.get(s.id)?.summary        ?? null,
    }))
  } else if (!owner) {
    // Public channel view: same rule as the homepage — show all except admin-hidden.
    slips = slips.filter((s) => !hidden.has(s.id))
  }

  return NextResponse.json(
    { slips },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
