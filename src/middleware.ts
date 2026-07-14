// ── Country middleware ─────────────────────────────────────────────
// Resolves the active market for every request and forwards it as the
// x-country header (read by API routes / server components via
// src/lib/country.ts). Also implements the bare-main-domain behaviour:
// geo-redirect to a live market's subdomain, or the /welcome picker.
//
// Resolution: ?country=XX (dev override, persisted to a cookie) →
// subdomain (ng.betfluencer.org → NG) → override cookie → UG.
//
// UGANDA SAFETY: on localhost / vercel.app previews / any non-
// betfluencer.org host, NO redirect or rewrite ever fires — requests
// pass through with x-country resolved (UG unless overridden), i.e.
// exactly today's behaviour. Redirect/landing logic is gated to the
// bare main domain only; market subdomains are never redirected.
//
// (History: this file was a no-op after the Supabase Auth revert —
// auth still needs no middleware; this is country routing only.)
import { type NextRequest, NextResponse } from 'next/server'
import {
  COUNTRY_HEADER,
  DEFAULT_COUNTRY,
  MAIN_DOMAIN,
  OVERRIDE_COOKIE,
  REMEMBER_COOKIE,
  isMainDomainHost,
  loadCountries,
  normalizeCode,
  subdomainCode,
} from '@/lib/country'

/** 30 days — how long the ?country= dev override sticks. */
const OVERRIDE_MAX_AGE = 60 * 60 * 24 * 30

/** Redirect to the same path+query on a market's subdomain. */
function subdomainRedirect(req: NextRequest, subdomain: string) {
  const dest = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${subdomain}.${MAIN_DOMAIN}`)
  return NextResponse.redirect(dest)
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  const path = req.nextUrl.pathname

  // Resolve the active country: param → subdomain → override cookie → UG.
  const param = normalizeCode(req.nextUrl.searchParams.get('country'))
  const sub = subdomainCode(host)
  const cookieOverride = normalizeCode(req.cookies.get(OVERRIDE_COOKIE)?.value)
  const code = param ?? sub ?? cookieOverride ?? DEFAULT_COUNTRY.code

  // ── Bare main domain (betfluencer.org): geo-redirect or picker ──
  // Page navigations only — never API calls, Next internals, static
  // files, the picker itself, or /pay/* (card-payment return URL).
  // A ?country= override always wins and skips this entirely.
  const isPage =
    !path.startsWith('/api') &&
    !path.startsWith('/_next') &&
    !path.startsWith('/welcome') &&
    !path.startsWith('/pay') &&
    !/\.[^/]+$/.test(path)

  if (!param && isPage && isMainDomainHost(host)) {
    const countries = await loadCountries()
    const activeByCode = new Map(countries.filter(c => c.active).map(c => [c.code, c]))

    // 1) "Remember my choice" cookie from the picker (live markets only).
    const remembered = activeByCode.get(normalizeCode(req.cookies.get(REMEMBER_COOKIE)?.value) ?? '')
    if (remembered) return subdomainRedirect(req, remembered.subdomain)

    // 2) Cloudflare geo header → that country's subdomain, if live.
    const geo = activeByCode.get(normalizeCode(req.headers.get('cf-ipcountry')) ?? '')
    if (geo) return subdomainRedirect(req, geo.subdomain)

    // 3) Unknown / not-yet-live country → the picker (URL unchanged, so
    //    the visitor never sees a broken or empty market page).
    const dest = req.nextUrl.clone()
    dest.pathname = '/welcome'
    return NextResponse.rewrite(dest)
  }

  // ── Normal flow: forward x-country to routes and pages ──────────
  const fwd = new Headers(req.headers)
  fwd.set(COUNTRY_HEADER, code)
  const res = NextResponse.next({ request: { headers: fwd } })

  // Persist the dev override so client-side fetches (no query param)
  // resolve the same market during local testing.
  if (param && param !== cookieOverride) {
    res.cookies.set(OVERRIDE_COOKIE, param, {
      path: '/',
      maxAge: OVERRIDE_MAX_AGE,
      sameSite: 'lax',
    })
  }
  return res
}

export const config = {
  // Everything except Next static assets — API routes DO need x-country.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
