// ── Multi-country resolution ───────────────────────────────────────
// One codebase serves several markets, each on its own subdomain
// (ug.betfluencer.org, ng.betfluencer.org, …). This module resolves the
// ACTIVE country for a request and loads per-country config from the
// `countries` table (migration 0011).
//
// Resolution order (first hit wins):
//   1. `?country=XX` query param — local-dev override (subdomains don't
//      work on localhost). Middleware persists it to OVERRIDE_COOKIE so
//      client-side fetches (which don't carry the param) stay consistent.
//   2. Subdomain of MAIN_DOMAIN (`ng.betfluencer.org` → NG).
//   3. OVERRIDE_COOKIE — the persisted dev override.
//   4. Uganda. ALWAYS Uganda: unknown host, missing countries table,
//      unreachable DB — every failure path lands on DEFAULT_COUNTRY, so
//      the live UG market can never break from this code.
//
// Edge-safe on purpose: middleware imports this, so no supabase-js, no
// next/headers — plain fetch against the Supabase REST API with a short
// module-level cache.

import { BETTING_SITES } from './bettingSites'

export type Country = {
  code:             string   // ISO 3166-1 alpha-2, e.g. 'UG'
  name:             string
  subdomain:        string   // 'ng' → ng.betfluencer.org
  currency_code:    string   // ISO 4217, e.g. 'NGN'
  currency_symbol:  string   // display prefix, e.g. '₦'
  betting_sites:    string[] // ordered, most popular first
  payments_enabled: boolean  // false → free/stub unlock flow (no ioTec)
  active:           boolean  // live market (geo-redirect target)
  coming_soon:      boolean  // shown on the picker, not clickable
}

// The live market, mirrored from the migration seed. Used whenever the
// DB row can't be loaded — identical to today's hardcoded behaviour.
export const DEFAULT_COUNTRY: Country = {
  code: 'UG',
  name: 'Uganda',
  subdomain: 'ug',
  currency_code: 'UGX',
  currency_symbol: 'UGX',
  betting_sites: [...BETTING_SITES],
  payments_enabled: true,
  active: true,
  coming_soon: false,
}

export const COUNTRY_HEADER  = 'x-country'           // set by middleware, read by routes
export const OVERRIDE_COOKIE = 'bf_country_override' // persisted ?country= dev override
export const REMEMBER_COOKIE = 'bf_country'          // "remember my choice" on /welcome

export const MAIN_DOMAIN =
  process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? 'betfluencer.org'

// ── Host / code parsing (pure) ─────────────────────────────────────

function bareHost(host: string): string {
  return host.split(':')[0].trim().toLowerCase()
}

/** 'UG' for any valid-looking 2-letter code, else null. */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const c = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) ? c : null
}

/** Bare main domain (betfluencer.org / www.) — the landing/redirect host. */
export function isMainDomainHost(host: string): boolean {
  const h = bareHost(host)
  return h === MAIN_DOMAIN || h === `www.${MAIN_DOMAIN}`
}

/**
 * Country code from a market subdomain (`ng.betfluencer.org` → 'NG').
 * Anything that isn't a 2-letter label directly under MAIN_DOMAIN —
 * localhost, vercel.app previews, IPs, www — returns null.
 */
export function subdomainCode(host: string): string | null {
  const h = bareHost(host)
  if (!h.endsWith(`.${MAIN_DOMAIN}`)) return null
  const sub = h.slice(0, -(MAIN_DOMAIN.length + 1))
  return /^[a-z]{2}$/.test(sub) ? sub.toUpperCase() : null
}

// ── Country config loading (60s module cache, UG fallback) ────────

const CACHE_TTL_MS = 60_000
let cache: { at: number; rows: Country[] } | null = null

/** Drop the cached rows (admin just toggled a market). Only clears THIS
 *  runtime's cache — the edge middleware refreshes within CACHE_TTL_MS. */
export function invalidateCountryCache(): void {
  cache = null
}

/**
 * All countries from the DB via Supabase REST (edge-safe). On ANY
 * failure — missing env, table not yet migrated, network error — falls
 * back to a Uganda-only list so the app behaves exactly like today.
 */
export async function loadCountries(): Promise<Country[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return [DEFAULT_COUNTRY]

  try {
    // Explicit columns (not *): countries also carries about_content
    // (jsonb, migration 0012) which only the About page needs — keep it
    // out of the middleware's per-request cache.
    const cols = 'code,name,subdomain,currency_code,currency_symbol,betting_sites,payments_enabled,active,coming_soon'
    const res = await fetch(`${url}/rest/v1/countries?select=${cols}&order=code.asc`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`countries fetch → ${res.status}`)
    const rows = (await res.json()) as Country[]
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('countries table empty')
    cache = { at: Date.now(), rows }
    return rows
  } catch (e) {
    console.error('loadCountries failed — falling back to UG only:', (e as Error)?.message)
    return [DEFAULT_COUNTRY]
  }
}

/** One country by code; unknown codes resolve to Uganda. */
export async function loadCountry(code: string | null | undefined): Promise<Country> {
  const rows = await loadCountries()
  const norm = normalizeCode(code)
  return (
    rows.find(c => c.code === norm) ??
    rows.find(c => c.code === DEFAULT_COUNTRY.code) ??
    DEFAULT_COUNTRY
  )
}

// ── Request → active country (for route handlers) ─────────────────

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

/**
 * Active country for an incoming request. Reads the x-country header set
 * by middleware; if middleware didn't run (unit tests, direct invocation)
 * it re-derives from the request itself. Never throws, never returns
 * anything but a full Country (UG at worst).
 */
export async function getActiveCountry(req?: Request): Promise<Country> {
  let code: string | null = null
  if (req) {
    code = normalizeCode(req.headers.get(COUNTRY_HEADER))
    if (!code) {
      try {
        code = normalizeCode(new URL(req.url).searchParams.get('country'))
      } catch { /* relative/opaque URL — ignore */ }
      code =
        code ??
        subdomainCode(req.headers.get('host') ?? '') ??
        normalizeCode(cookieValue(req.headers.get('cookie'), OVERRIDE_COOKIE))
    }
  }
  return loadCountry(code)
}
