import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET() {
  const db = supabaseServer()

  const { data: tipsters, error } = await db
    .from('tipsters')
    .select('id, name, username, phone, sport, description, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ tipsters: [] })

  return NextResponse.json({ tipsters: tipsters ?? [] })
} 
