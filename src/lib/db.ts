// ── Database queries ──────────────────────────────────────────────
// Supabase (service role) with a mock fallback for the tipster listing.

import { supabaseServer } from './supabase'
import { MOCK_TIPSTERS } from './mockData'
import type { TipsterPublic } from '@/types'

// ── TIPSTERS ─────────────────────────────────────────────────────
export async function getAllTipsters(): Promise<TipsterPublic[]> {
  const db = supabaseServer()
  if (!db) return MOCK_TIPSTERS

  const { data, error } = await db
    .from('tipster_stats')
    .select('*')
    .order('score', { ascending: false })

  if (error || !data) return MOCK_TIPSTERS
  return data as TipsterPublic[]
}

export async function getTipsterByIdentifier(slug: string): Promise<TipsterPublic | null> {
  const db = supabaseServer()
  if (!db) return null

  // Try username first (maybeSingle returns null instead of throwing on no match)
  const { data: byUsername } = await db
    .from('tipster_stats')
    .select('*')
    .ilike('username', slug)
    .maybeSingle()

  if (byUsername) return byUsername

  // Try UUID
  const { data: byId } = await db
    .from('tipster_stats')
    .select('*')
    .eq('id', slug)
    .maybeSingle()

  return byId ?? null
}

// ── TIPSTER AUTH ─────────────────────────────────────────────────
export async function getTipsterByPhone(phone: string) {
  const db = supabaseServer()
  if (!db) return null

  const { data } = await db
    .from('tipsters')
    .select('*')
    .eq('phone', phone)
    .single()

  return data ?? null
}

export async function createTipsterAccount(tipster: {
  name:          string
  username:      string
  phone:         string
  password_hash: string
  sport:         string
  description:   string
}) {
  const db = supabaseServer()
  if (!db) return null

  const { data } = await db
    .from('tipsters')
    .insert(tipster)
    .select()
    .single()

  return data
}

// Update the editable fields of a tipster's own profile. Only the columns
// present in `patch` are written. Returns the updated row, or a typed reason:
//   'no-db'          — mock mode (no service client configured)
//   'username-taken' — unique-violation on username (23505)
//   'error'          — any other DB error
export async function updateTipster(
  id: string,
  patch: { name?: string; username?: string; description?: string },
): Promise<
  | { ok: true; tipster: any }
  | { ok: false; reason: 'no-db' | 'username-taken' | 'error' }
> {
  const db = supabaseServer()
  if (!db) return { ok: false, reason: 'no-db' }

  const { data, error } = await db
    .from('tipsters')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') return { ok: false, reason: 'username-taken' }
    return { ok: false, reason: 'error' }
  }
  return { ok: true, tipster: data }
}

// ── EARNINGS LOG ─────────────────────────────────────────────────
export async function logEarning(earning: {
  tipster_id:  string
  amount:      number
  gross:       number
  commission:  number
  plan:        string
  user_phone:  string
}) {
  const db = supabaseServer()
  if (!db) return { id: 'mock-earning-' + Date.now(), ...earning }

  const { data } = await db
    .from('earnings')
    .insert(earning)
    .select()
    .single()

  return data
}

export async function getEarningsByTipster(tipsterId: string) {
  const db = supabaseServer()
  if (!db) return []

  const { data } = await db
    .from('earnings')
    .select('*')
    .eq('tipster_id', tipsterId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}