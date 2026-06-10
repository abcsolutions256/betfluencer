import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const db = supabaseServer()
  const { data } = await db
    .from('earnings')
    .select('*')
    .eq('tipster_id', params.slug)
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ earnings: data ?? [] })
}