import { NextResponse } from 'next/server'
import { supabaseSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const sb = supabaseSession()
  await sb.auth.signOut()
  return NextResponse.json({ ok: true })
}
