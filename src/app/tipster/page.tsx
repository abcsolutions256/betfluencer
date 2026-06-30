// /tipster entry point. Routes to the dashboard for a logged-in tipster,
// otherwise to login. Resolved from the real Supabase Auth session
// (server-side) — NOT the stale `bf_tipster` localStorage flag the old
// hand-rolled auth used, which the current login never sets.
import { redirect } from 'next/navigation'
import { getMyTipster } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function TipsterPage() {
  const tipster = await getMyTipster()
  redirect(tipster ? '/tipster/dashboard' : '/tipster/login')
}
