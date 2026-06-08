// ── mockData.ts ───────────────────────────────────────────────────
// This file provides fallback data for local development only.
// In production, all data comes from Supabase via the API routes.

import type { TipsterPublic } from '@/types'
import type { Betslip } from '@/types/betslip'

// ── EMPTY ARRAYS — real data comes from Supabase ──────────────────
export const MOCK_TIPSTERS: TipsterPublic[] = []
export const MOCK_BETSLIPS: Record<string, Betslip[]> = {}

// ── HELPERS ───────────────────────────────────────────────────────
export function getTipsterBySlug(slug: string): TipsterPublic | null {
  return MOCK_TIPSTERS.find(t =>
    t.username.toLowerCase() === slug.toLowerCase()
  ) ?? null
}

export function getBetslipsForTipster(tipsterId: string): Betslip[] {
  return MOCK_BETSLIPS[tipsterId] ?? []
}