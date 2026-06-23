import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const db = supabaseServer()
  const { data: tipsters, error } = await db
    .from('tipster_stats')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('tipster_stats error:', error)
    return NextResponse.json({ tipsters: [], error: error.message })
  }

  return NextResponse.json(
    { tipsters: tipsters ?? [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}