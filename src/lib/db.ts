// ── Database queries with mock fallback ──────────────────────────
// Uses Supabase when configured, falls back to mock data locally

import { supabaseServer } from './supabase'
import {
  MOCK_TIPSTERS,
} from './mockData'
import type { TipsterPublic, Tip, Subscription } from '@/types'

// ── TIPSTERS ─────────────────────────────────────────────────────
export async function getAllTipsters(): Promise<TipsterPublic[]> {
  const db = supabaseServer()
  if (!db) return MOCK_TIPSTERS

  const { data, error } = await db
    .from('tipster_rankings')
    .select('*')
    .order('score', { ascending: false })

  if (error || !data) return MOCK_TIPSTERS
  return data as TipsterPublic[]
}

export async function getTipsterByIdentifier(slug: string): Promise<TipsterPublic | null> {
  const db = supabaseServer()
  if (!db) return null

  const { data } = await db
    .from('tipster_rankings')
    .select('*')
    .or(`username.ilike.${slug},id.eq.${slug}`)
    .single()

  return data ?? null
}

// ── TIPS ─────────────────────────────────────────────────────────
export async function getTipsByTipster(tipsterId: string): Promise<Tip[]> {
  const db = supabaseServer()
  if (!db) return []

  const { data } = await db
    .from('tips')
    .select('*')
    .eq('tipster_id', tipsterId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}

export async function createTip(tip: Omit<Tip, 'id' | 'created_at' | 'result'>): Promise<Tip | null> {
  const db = supabaseServer()
  if (!db) {
    // Mock response
    return { ...tip, id: 'mock-' + Date.now(), result: 'pending', created_at: new Date().toISOString() }
  }

  const { data } = await db
    .from('tips')
    .insert({ ...tip, result: 'pending' })
    .select()
    .single()

  return data ?? null
}

// ── SUBSCRIPTIONS ────────────────────────────────────────────────
export async function getSubscriptionsByPhone(phone: string) {
  const db = supabaseServer()
  if (!db) return []

  const { data } = await db
    .from('subscriptions')
    .select('*, tipster:tipster_rankings(*)')
    .eq('user_phone', phone)
    .eq('status', 'active')
    .order('expires_at', { ascending: false })

  return data ?? []
}

export async function checkActiveSubscription(
  userPhone: string,
  tipsterId: string
): Promise<boolean> {
  const db = supabaseServer()
  if (!db) {
    return false
  }

  const { data } = await db
    .from('subscriptions')
    .select('id')
    .eq('user_phone', userPhone)
    .eq('tipster_id', tipsterId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .single()

  return !!data
}

export async function createSubscription(sub: {
  tipster_id:  string
  user_phone:  string
  user_name:   string
  plan:        'weekly' | 'monthly'
  amount_paid: number
  expires_at:  string
}) {
  const db = supabaseServer()
  if (!db) return { id: 'mock-sub-' + Date.now(), ...sub, status: 'active', started_at: new Date().toISOString() }

  const { data } = await db
    .from('subscriptions')
    .insert({ ...sub, status: 'active' })
    .select()
    .single()

  return data
}

// ── TIPSTER AUTH ─────────────────────────────────────────────────
export async function getTipsterByPhone(phone: string) {
  const db = supabaseServer()
  if (!db) return MOCK_TIPSTERS.find(t => t.id === '1') ?? null // demo fallback

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
  if (!db) return { id: '1', ...tipster }

  const { data } = await db
    .from('tipsters')
    .insert(tipster)
    .select()
    .single()

  return data
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
