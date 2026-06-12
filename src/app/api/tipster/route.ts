import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

// Runs per request (hits the DB) — never prerender at build time.
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = supabaseServer()
  const { data: tipsters, error } = await db
    .from('tipster_rankings')
    .select('*')
    .order('score', { ascending: false })

  if (error) {
    console.error('tipster_rankings error:', error)
    return NextResponse.json({ tipsters: [], error: error.message })
  }
  return NextResponse.json({ tipsters: tipsters ?? [] })
}